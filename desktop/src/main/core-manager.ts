import { spawn, type ChildProcess } from 'child_process'
import { mkdirSync, existsSync, copyFileSync } from 'node:fs'
import { join } from 'path'
import { platform } from 'os'
import { BrowserWindow } from 'electron'
import type { ConnectionMode, CoreStatus, TunStatus } from '../shared/types'
import { CONTROLLER_HOST, CONTROLLER_PORT } from '../shared/types'
import {
  coreBinaryPath,
  coreHome,
  corePresent,
  wintunPath,
  bundledCoreDir,
  mihomoSafePaths,
  profilesRoot,
} from './paths'
import { getOrCreateSecret, getSettings, setSettings, getSelections } from './store'
import {
  activeConfigPath,
  rebuildActive,
  getActiveProfileId,
  setReloadActiveCoreHook,
} from './profiles'
import { mihomoApi } from './mihomo-api'
import { setSystemProxy } from './system-proxy'
import {
  ensureHelper,
  pingHelper,
  queryWindowsService,
  startCoreByHelper,
  stopCoreByHelper,
  replaceCoreViaHelper,
  sha256File,
} from './helper'
import { authorizeForTun, privilegesOk } from './privileges'
import { log } from './logger'

let child: ChildProcess | null = null
let mode: ConnectionMode = 'proxy'
let lastError: string | undefined
let crashCount = 0
let stopping = false
let connectChain: Promise<CoreStatus> | null = null

function broadcast(status: CoreStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('core:statusChanged', status)
  }
}

function childAlive(): boolean {
  return child != null && child.exitCode === null && child.signalCode === null
}

export async function getStatus(): Promise<CoreStatus> {
  const secret = getOrCreateSecret()
  mihomoApi.ensureSecretFromStore()
  const helperReady = await pingHelper()
  const settings = getSettings()
  const priv = await privilegesOk(settings.connectionMode === 'tun')
  let running = false
  if (childAlive()) {
    running = true
  } else if (helperReady) {
    running = await mihomoApi.ping()
  }
  return {
    running,
    mode,
    pid: child?.pid,
    controller: `${CONTROLLER_HOST}:${CONTROLLER_PORT}`,
    secret,
    lastError,
    helperReady,
    privilegesOk: priv,
  }
}

export async function getTunStatus(): Promise<TunStatus> {
  const settings = getSettings()
  const svc = platform() === 'win32' ? await queryWindowsService() : 'none'
  const helperRunning = await pingHelper()
  return {
    enabled: settings.connectionMode === 'tun',
    helperInstalled: svc !== 'none' || helperRunning,
    helperRunning,
    privilegesOk: await privilegesOk(true),
    lastError,
  }
}

function ensureWintun(): void {
  if (platform() !== 'win32') return
  const src = wintunPath()
  const dest = join(bundledCoreDir(), 'wintun.dll')
  if (existsSync(src) && src !== dest) {
    try {
      copyFileSync(src, dest)
    } catch {
      /* already there */
    }
  }
  const homeDll = join(coreHome(), 'wintun.dll')
  if (existsSync(src) && !existsSync(homeDll)) {
    try {
      mkdirSync(coreHome(), { recursive: true })
      copyFileSync(src, homeDll)
    } catch {
      /* ignore */
    }
  }
}

async function spawnCoreDirect(configPath: string): Promise<void> {
  const home = coreHome()
  mkdirSync(home, { recursive: true })
  mkdirSync(profilesRoot(), { recursive: true })
  ensureWintun()
  const bin = coreBinaryPath()
  if (!existsSync(bin)) throw new Error(`mihomo binary missing: ${bin}. Run npm run fetch-core.`)

  const secret = getOrCreateSecret()
  mihomoApi.setAuth(CONTROLLER_HOST, CONTROLLER_PORT, secret)

  child = spawn(
    bin,
    ['-d', home, '-f', configPath],
    {
      cwd: bundledCoreDir(),
      env: {
        ...process.env,
        SAFE_PATHS: mihomoSafePaths(),
      },
      windowsHide: true,
    },
  )
  child.stdout?.on('data', (d) => log(`[core] ${String(d).trim()}`))
  child.stderr?.on('data', (d) => log(`[core] ${String(d).trim()}`, 'warn'))
  child.on('exit', (code) => {
    log(`core exited code=${code}`)
    child = null
    if (!stopping) void onCrash()
  })
  await mihomoApi.waitReady()
}

async function spawnCoreElevated(configPath: string): Promise<void> {
  const home = coreHome()
  mkdirSync(home, { recursive: true })
  mkdirSync(profilesRoot(), { recursive: true })
  ensureWintun()
  const secret = getOrCreateSecret()
  mihomoApi.setAuth(CONTROLLER_HOST, CONTROLLER_PORT, secret)
  const arg = `-d "${home}" -f "${configPath}"`
  const ok = await startCoreByHelper(arg, home, mihomoSafePaths())
  if (!ok) throw new Error('helper failed to start core')
  await mihomoApi.waitReady()
}

async function cleanupCore(clearProxy: boolean): Promise<void> {
  try {
    await stopCoreByHelper()
  } catch {
    /* ignore */
  }
  if (child) {
    child.kill()
    child = null
  }
  if (clearProxy) {
    try {
      await setSystemProxy(false, getSettings().mixedPort)
    } catch {
      /* ignore */
    }
  }
}

async function disconnectInternal(clearProxy: boolean, forReconnect = false): Promise<void> {
  if (!forReconnect) stopping = true
  await cleanupCore(clearProxy)
}

async function onCrash(): Promise<void> {
  crashCount++
  lastError = 'core crashed'
  broadcast(await getStatus())
  if (crashCount > 5) {
    log('crash loop — giving up', 'error')
    return
  }
  log(`restarting core after crash (#${crashCount})`)
  try {
    await connectInternal(mode)
  } catch (e) {
    lastError = String(e)
  }
}

async function connectInternal(requested?: ConnectionMode): Promise<CoreStatus> {
  stopping = false
  lastError = undefined
  const settings = getSettings()
  mode = requested ?? settings.connectionMode

  if (!getActiveProfileId()) {
    lastError = 'no active profile'
    throw new Error(lastError)
  }

  let effectiveMode = mode
  if (effectiveMode === 'tun') {
    const auth = await authorizeForTun()
    if (!auth) {
      lastError = 'privileges required for TUN'
      log(lastError, 'error')
      effectiveMode = 'proxy'
      mode = 'proxy'
      log('falling back to mixed-port proxy mode for this session', 'warn')
    }
  }

  if (effectiveMode === 'tun' && platform() === 'win32' && !(await pingHelper())) {
    lastError = 'TUN on Windows requires the helper service — install helper or use Proxy mode'
    throw new Error(lastError)
  }

  const rebuildSettings =
    effectiveMode === 'tun'
      ? { ...settings, tunEnabled: true, connectionMode: 'tun' as const }
      : { ...settings, tunEnabled: false, connectionMode: 'proxy' as const }

  const configPath = rebuildActive(rebuildSettings)
  if (!configPath || !existsSync(configPath)) {
    lastError = 'config rebuild failed'
    throw new Error(lastError)
  }

  await disconnectInternal(false, true)

  try {
    if (effectiveMode === 'tun' && (await pingHelper())) {
      await spawnCoreElevated(configPath)
    } else {
      await spawnCoreDirect(configPath)
    }
    stopping = false
    await mihomoApi.putConfigs(configPath).catch(() => undefined)
    await mihomoApi.applySelections(getSelections())

    if (effectiveMode === 'proxy' && settings.systemProxy) {
      await setSystemProxy(true, settings.mixedPort)
    }
    crashCount = 0
    log(`connected mode=${effectiveMode}`)
  } catch (e) {
    lastError = String(e)
    log(`connect failed: ${e}`, 'error')
    await cleanupCore(false)
    stopping = false
    throw e
  }

  const status = await getStatus()
  broadcast(status)
  return status
}

export async function connect(requested?: ConnectionMode): Promise<CoreStatus> {
  if (connectChain) return connectChain
  connectChain = connectInternal(requested).finally(() => {
    connectChain = null
  })
  return connectChain
}

export async function disconnect(): Promise<CoreStatus> {
  await disconnectInternal(true, false)
  stopping = false
  lastError = undefined
  log('disconnected')
  const status = await getStatus()
  broadcast(status)
  return status
}

export async function setTunEnabled(enabled: boolean): Promise<TunStatus> {
  return setConnectionMode(enabled ? 'tun' : 'proxy')
}

export async function setConnectionMode(next: ConnectionMode): Promise<TunStatus> {
  setSettings({ connectionMode: next })
  const running = (await getStatus()).running
  if (running) {
    try {
      await connect(next)
    } catch (e) {
      lastError = String(e)
    }
  }
  return getTunStatus()
}

export async function ensureHelperAndStatus(): Promise<TunStatus> {
  await ensureHelper()
  return getTunStatus()
}

/** B6 — replace core binary via helper when installed in Program Files. */
export async function updateCoreBinary(pendingPath: string): Promise<boolean> {
  const target = coreBinaryPath()
  if (await pingHelper()) {
    const ok = await replaceCoreViaHelper(pendingPath, target)
    if (ok) {
      log(`core updated via helper → ${target}`)
      return true
    }
  }
  try {
    copyFileSync(pendingPath, target)
    log(`core updated directly → ${target}`)
    return true
  } catch (e) {
    log(`core update failed: ${e}`, 'error')
    return false
  }
}

export function coreBinarySha256(): string | null {
  if (!corePresent()) return null
  return sha256File(coreBinaryPath())
}

// re-export for index
export { corePresent }

// Break profiles ↔ core-manager cycle: profiles calls this after a live reload.
setReloadActiveCoreHook(async (configPath) => {
  const st = await getStatus()
  if (!st.running) return
  mihomoApi.ensureSecretFromStore()
  await mihomoApi.putConfigs(configPath)
  await mihomoApi.applySelections(getSelections())
  await mihomoApi.closeAllConnections()
})
