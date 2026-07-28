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
import {
  getOrCreateSecret,
  getSettings,
  setSettings,
  getSelections,
  isSystemProxyOwned,
  setSystemProxyOwned,
} from './store'
import {
  rebuildConfig,
  getActiveProfileId,
  readEffectiveNetworkConfig,
  resolveProfileNetwork,
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
import { LatestWinsCoordinator, type LifecycleTicket } from './lifecycle-coordinator'

let child: ChildProcess | null = null
let mode: ConnectionMode = 'proxy'
let lastError: string | undefined
let crashCount = 0
const intentionalStops = new WeakSet<ChildProcess>()

type ConfigApplyReason = 'cold-start' | 'profile-switch' | 'live-reload'

interface LifecycleTarget {
  running: boolean
  mode: ConnectionMode
  profileId: string | null
  reason: ConfigApplyReason
  rebuildWhenStopped?: boolean
  clearProxy?: boolean
  preparedConfigPath?: string
}

async function setManagedSystemProxy(port: number): Promise<void> {
  await setSystemProxy(true, port)
  setSystemProxyOwned(true)
}

async function clearManagedSystemProxy(): Promise<void> {
  if (!isSystemProxyOwned()) return
  await setSystemProxy(false, getSettings().mixedPort)
  setSystemProxyOwned(false)
}

function configuredMode(profileId: string | null, requested: ConnectionMode): ConnectionMode {
  const settings = getSettings()
  if (settings.networkOverrideEnabled || !profileId) return requested
  return resolveProfileNetwork(profileId, settings).mode
}

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
  let running = false
  if (childAlive()) {
    running = true
  } else if (helperReady) {
    running = await mihomoApi.ping()
  }
  const desired = lifecycle.desiredTarget
  let statusMode = running && childAlive() ? mode : settings.connectionMode
  try {
    statusMode = running && childAlive()
      ? mode
      : configuredMode(
          desired?.profileId ?? getActiveProfileId(),
          settings.connectionMode,
        )
  } catch {
    // Config validation is reported during rebuild/connect; keep status available.
  }
  if (running && !childAlive()) mode = statusMode
  const priv = await privilegesOk(statusMode === 'tun')
  return {
    running,
    mode: statusMode,
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
  mihomoApi.ensureSecretFromStore()
  const running = childAlive() || (helperRunning && (await mihomoApi.ping()))
  const desired = lifecycle.desiredTarget
  let effectiveMode = running ? mode : settings.connectionMode
  try {
    if (!running) {
      effectiveMode = configuredMode(
        desired?.profileId ?? getActiveProfileId(),
        settings.connectionMode,
      )
    }
  } catch {
    // Config validation is reported during rebuild/connect; keep status available.
  }
  return {
    enabled: effectiveMode === 'tun',
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

  const coreProcess = spawn(
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
  child = coreProcess
  coreProcess.stdout?.on('data', (d) => log(`[core] ${String(d).trim()}`))
  coreProcess.stderr?.on('data', (d) => log(`[core] ${String(d).trim()}`, 'warn'))
  coreProcess.on('exit', (code) => {
    log(`core exited code=${code}`)
    if (child === coreProcess) child = null
    if (!intentionalStops.has(coreProcess)) void onCrash()
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
    const coreProcess = child
    child = null
    intentionalStops.add(coreProcess)
    coreProcess.kill()
  }
  if (clearProxy) {
    try {
      await clearManagedSystemProxy()
    } catch {
      /* ignore */
    }
  }
}

async function onCrash(): Promise<void> {
  crashCount++
  lastError = 'core crashed'
  if (crashCount > 5) {
    log('crash loop — giving up', 'error')
    broadcast(await getStatus())
    return
  }
  log(`restarting core after crash (#${crashCount})`)
  const desired = lifecycle.desiredTarget
  if (!desired?.running || !desired.profileId) return
  void lifecycle
    .request({ ...desired, reason: 'cold-start' })
    .catch(async (error) => {
      lastError = String(error)
      broadcast(await getStatus())
    })
}

async function reconcileLifecycle(
  ticket: LifecycleTicket<LifecycleTarget>,
  isCurrent: () => boolean,
): Promise<void> {
  const target = ticket.target
  if (!target.running) {
    await cleanupCore(target.clearProxy === true)
    if (!isCurrent()) return
    mode = target.mode
    if (target.rebuildWhenStopped && target.profileId) {
      rebuildConfig(target.profileId)
      log(`applying config profile=${target.profileId} reason=profile-switch (stopped)`)
    }
    lastError = undefined
    log('disconnected')
    const status = await getStatus()
    if (isCurrent()) broadcast(status)
    return
  }

  lastError = undefined
  const settings = getSettings()
  const profileId = target.profileId
  if (!profileId) {
    lastError = 'no active profile'
    throw new Error(lastError)
  }

  let effectiveMode = configuredMode(profileId, target.mode)
  if (effectiveMode === 'tun') {
    const auth = await authorizeForTun()
    if (!auth) {
      lastError = 'privileges required for TUN'
      log(lastError, 'error')
      if (!settings.networkOverrideEnabled) throw new Error(lastError)
      effectiveMode = 'proxy'
      log('falling back to mixed-port proxy mode for this session', 'warn')
    }
  }

  if (effectiveMode === 'tun' && platform() === 'win32' && !(await pingHelper())) {
    lastError = 'TUN on Windows requires the helper service — install helper or use Proxy mode'
    throw new Error(lastError)
  }

  const rebuildSettings = settings.networkOverrideEnabled
    ? effectiveMode === 'tun'
      ? { ...settings, tunEnabled: true, connectionMode: 'tun' as const }
      : { ...settings, tunEnabled: false, connectionMode: 'proxy' as const }
    : settings

  const configPath =
    target.preparedConfigPath && !settings.networkOverrideEnabled
      ? target.preparedConfigPath
      : rebuildConfig(profileId, rebuildSettings)
  if (!existsSync(configPath)) {
    lastError = 'config rebuild failed'
    throw new Error(lastError)
  }

  await cleanupCore(false)
  if (!isCurrent()) return
  if (!settings.networkOverrideEnabled || effectiveMode === 'tun') {
    await clearManagedSystemProxy()
  }
  if (!isCurrent()) return

  try {
    log(
      `lifecycle generation=${ticket.generation} profile=${profileId} reason=${target.reason}`,
    )
    const helperReady = effectiveMode === 'tun' && (await pingHelper())
    if (!isCurrent()) return
    if (helperReady) {
      await spawnCoreElevated(configPath)
    } else {
      await spawnCoreDirect(configPath)
    }
    if (!isCurrent()) return
    await mihomoApi.applySelections(getSelections(profileId))
    if (!isCurrent()) return

    if (
      settings.networkOverrideEnabled &&
      effectiveMode === 'proxy' &&
      settings.systemProxy
    ) {
      await setManagedSystemProxy(settings.mixedPort)
    }
    if (!isCurrent()) return
    mode = effectiveMode
    crashCount = 0
    log(`connected mode=${effectiveMode} profile=${profileId}`)
  } catch (e) {
    if (!isCurrent()) return
    lastError = String(e)
    log(`connect failed: ${e}`, 'error')
    await cleanupCore(true)
    throw e
  }

  if (isCurrent()) {
    const status = await getStatus()
    if (isCurrent()) broadcast(status)
  }
}

const lifecycle = new LatestWinsCoordinator<LifecycleTarget>(reconcileLifecycle)

async function requestLifecycle(target: LifecycleTarget): Promise<CoreStatus> {
  await lifecycle.request(target)
  return getStatus()
}

export async function connect(
  requested?: ConnectionMode,
  reason: ConfigApplyReason = 'cold-start',
  profileId: string | null = getActiveProfileId(),
): Promise<CoreStatus> {
  const settings = getSettings()
  return requestLifecycle({
    running: true,
    mode: requested ?? settings.connectionMode,
    profileId,
    reason,
  })
}

export async function disconnect(): Promise<CoreStatus> {
  const desired = lifecycle.desiredTarget
  return requestLifecycle({
    running: false,
    mode: desired?.mode ?? getSettings().connectionMode,
    profileId: desired?.profileId ?? getActiveProfileId(),
    reason: 'cold-start',
    clearProxy: true,
  })
}

export async function switchProfile(profileId: string): Promise<CoreStatus> {
  const desired = lifecycle.desiredTarget
  const running = desired?.running ?? (await getStatus()).running
  return requestLifecycle({
    running,
    mode: desired?.mode ?? getSettings().connectionMode,
    profileId,
    reason: 'profile-switch',
    rebuildWhenStopped: !running,
  })
}

export async function setTunEnabled(enabled: boolean): Promise<TunStatus> {
  return setConnectionMode(enabled ? 'tun' : 'proxy')
}

export async function setConnectionMode(next: ConnectionMode): Promise<TunStatus> {
  setSettings({ connectionMode: next })
  if (!getSettings().networkOverrideEnabled) return getTunStatus()
  const desired = lifecycle.desiredTarget
  const running = desired?.running ?? (await getStatus()).running
  if (running) {
    try {
      await connect(next, 'cold-start', desired?.profileId ?? getActiveProfileId())
    } catch (e) {
      lastError = String(e)
    }
  }
  return getTunStatus()
}

export async function syncManagedSystemProxy(running: boolean): Promise<void> {
  const settings = getSettings()
  if (
    running &&
    settings.networkOverrideEnabled &&
    settings.systemProxy &&
    mode === 'proxy'
  ) {
    await setManagedSystemProxy(settings.mixedPort)
  } else {
    await clearManagedSystemProxy()
  }
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
setReloadActiveCoreHook(async (configPath, profileId) => {
  const st = await getStatus()
  if (!st.running) return
  if (getActiveProfileId() !== profileId) return
  const network = readEffectiveNetworkConfig(configPath)
  if (network.mode !== mode) {
    await lifecycle.request({
      running: true,
      mode: network.mode,
      profileId,
      reason: 'live-reload',
      preparedConfigPath: configPath,
    })
    return
  }
  log(`applying config profile=${profileId} reason=live-reload`)
  mihomoApi.ensureSecretFromStore()
  await mihomoApi.putConfigs(configPath)
  await mihomoApi.applySelections(getSelections(profileId))
  await mihomoApi.closeAllConnections()
})
