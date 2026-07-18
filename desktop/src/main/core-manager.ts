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
} from './paths'
import { getOrCreateSecret, getSettings, setSettings } from './store'
import {
  activeConfigPath,
  rebuildActive,
  getActiveProfileId,
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

function broadcast(status: CoreStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('core:statusChanged', status)
  }
}

export async function getStatus(): Promise<CoreStatus> {
  const secret = getOrCreateSecret()
  const helperReady = await pingHelper()
  const priv = await privilegesOk(getSettings().tunEnabled)
  const running = child != null || (helperReady && (await mihomoApi.ping()))
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
  return {
    enabled: settings.tunEnabled,
    helperInstalled: svc !== 'none' || (await pingHelper()),
    helperRunning: await pingHelper(),
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
  // Also copy next to running cwd home for some mihomo layouts
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
        SAFE_PATHS: home,
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
  ensureWintun()
  const secret = getOrCreateSecret()
  mihomoApi.setAuth(CONTROLLER_HOST, CONTROLLER_PORT, secret)
  // Helper starts bare binary with one arg — pass controller dial via env in helper;
  // we start with -d/-f by encoding in arg string for our Go helper.
  const arg = `-d "${home}" -f "${configPath}"`
  const ok = await startCoreByHelper(arg, home)
  if (!ok) throw new Error('helper failed to start core')
  await mihomoApi.waitReady()
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
    await connect(mode)
  } catch (e) {
    lastError = String(e)
  }
}

export async function connect(requested?: ConnectionMode): Promise<CoreStatus> {
  stopping = false
  lastError = undefined
  const settings = getSettings()
  mode = requested ?? (settings.tunEnabled ? 'tun' : 'proxy')

  if (!getActiveProfileId()) {
    lastError = 'no active profile'
    throw new Error(lastError)
  }

  // Rebuild config with current overrides (mixed-port / tun / dns)
  if (mode === 'tun') {
    setSettings({ tunEnabled: true })
    const auth = await authorizeForTun()
    if (!auth) {
      lastError = 'privileges required for TUN'
      log(lastError, 'error')
      // fallback to proxy
      mode = 'proxy'
      setSettings({ tunEnabled: false })
      log('falling back to mixed-port proxy mode', 'warn')
    }
  } else {
    setSettings({ tunEnabled: false })
  }

  const configPath = rebuildActive()
  if (!configPath || !existsSync(configPath)) {
    lastError = 'config rebuild failed'
    throw new Error(lastError)
  }

  await disconnectInternal(false)

  try {
    if (mode === 'tun' && (await pingHelper())) {
      await spawnCoreElevated(configPath)
    } else {
      await spawnCoreDirect(configPath)
    }
    // Ensure config path loaded (in case process started with empty)
    await mihomoApi.putConfigs(configPath).catch(() => undefined)

    if (mode === 'proxy' && settings.systemProxy) {
      await setSystemProxy(true, settings.mixedPort)
    }
    crashCount = 0
    log(`connected mode=${mode}`)
  } catch (e) {
    lastError = String(e)
    log(`connect failed: ${e}`, 'error')
    throw e
  }

  const status = await getStatus()
  broadcast(status)
  return status
}

async function disconnectInternal(clearProxy: boolean): Promise<void> {
  stopping = true
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

export async function disconnect(): Promise<CoreStatus> {
  await disconnectInternal(true)
  lastError = undefined
  log('disconnected')
  const status = await getStatus()
  broadcast(status)
  return status
}

export async function setTunEnabled(enabled: boolean): Promise<TunStatus> {
  setSettings({ tunEnabled: enabled })
  const running = (await getStatus()).running
  if (running) {
    try {
      await connect(enabled ? 'tun' : 'proxy')
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
