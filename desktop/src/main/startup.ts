import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, join } from 'path'

export const HIDDEN_LAUNCH_ARG = '--hidden'

interface LoginItemSettings {
  openAtLogin?: boolean
  wasOpenedAtLogin?: boolean
  executableWillLaunchAtLogin?: boolean
}

interface ElectronAppAdapter {
  isPackaged: boolean
  getPath(name: 'home'): string
  setLoginItemSettings(settings: {
    openAtLogin: boolean
    path?: string
    args?: string[]
    enabled?: boolean
    name?: string
  }): void
  getLoginItemSettings(options?: { path?: string; args?: string[] }): LoginItemSettings
}

export interface StartupIdentity {
  appId: string
  productName: string
}

export interface StartupRuntime {
  platform: NodeJS.Platform
  argv: string[]
  execPath: string
  env: NodeJS.ProcessEnv
}

function defaultRuntime(): StartupRuntime {
  return {
    platform: process.platform,
    argv: process.argv,
    execPath: process.execPath,
    env: process.env,
  }
}

export function quoteDesktopExecArg(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/%/g, '%%')
  return `"${escaped}"`
}

export function linuxAutostartPath(
  homeDir: string,
  appId: string,
  env: NodeJS.ProcessEnv,
): string {
  const xdgRoot = env.XDG_CONFIG_HOME?.trim()
  const configRoot = xdgRoot && isAbsolute(xdgRoot) ? xdgRoot : join(homeDir, '.config')
  const safeId = appId.toLowerCase().replace(/[^a-z0-9._-]/g, '-')
  return join(configRoot, 'autostart', `${safeId}.desktop`)
}

export function linuxLaunchExecutable(runtime: StartupRuntime): string {
  return runtime.env.APPIMAGE?.trim() || runtime.execPath
}

export function linuxDesktopEntry(identity: StartupIdentity, executable: string): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${identity.productName.replace(/[\r\n]/g, ' ')}`,
    `Exec=${quoteDesktopExecArg(executable)} ${HIDDEN_LAUNCH_ARG}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    `X-Cheezy-Managed=${identity.appId}`,
    '',
  ].join('\n')
}

export function isSystemStartupLaunch(
  app: ElectronAppAdapter,
  runtime: StartupRuntime = defaultRuntime(),
): boolean {
  if (runtime.argv.includes(HIDDEN_LAUNCH_ARG)) return true
  return runtime.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin === true
}

/** Apply and verify the persisted launch-at-login preference. */
export function applyAutoStart(
  app: ElectronAppAdapter,
  enabled: boolean,
  identity: StartupIdentity,
  runtime: StartupRuntime = defaultRuntime(),
): void {
  if (!app.isPackaged) {
    if (enabled) throw new Error('Launch at startup is available in the installed app')
    return
  }

  if (runtime.platform === 'linux') {
    const target = linuxAutostartPath(app.getPath('home'), identity.appId, runtime.env)
    if (!enabled) {
      rmSync(target, { force: true })
      return
    }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, linuxDesktopEntry(identity, linuxLaunchExecutable(runtime)), {
      encoding: 'utf8',
      mode: 0o600,
    })
    if (!existsSync(target)) throw new Error('Could not create the Linux autostart entry')
    return
  }

  if (runtime.platform === 'win32') {
    const options = { path: runtime.execPath, args: [HIDDEN_LAUNCH_ARG] }
    app.setLoginItemSettings({
      openAtLogin: enabled,
      enabled,
      name: identity.appId,
      ...options,
    })
    const state = app.getLoginItemSettings(options)
    const active = state.executableWillLaunchAtLogin ?? state.openAtLogin ?? false
    if (active !== enabled) throw new Error('Windows did not apply the startup preference')
    return
  }

  if (runtime.platform === 'darwin') {
    app.setLoginItemSettings({ openAtLogin: enabled })
    if ((app.getLoginItemSettings().openAtLogin ?? false) !== enabled) {
      throw new Error('macOS did not apply the startup preference')
    }
    return
  }

  throw new Error(`Launch at startup is not supported on ${runtime.platform}`)
}
