import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { platform, arch } from 'os'

export function userDataRoot(): string {
  return join(app.getPath('userData'), 'cheezy')
}

export function profilesRoot(): string {
  return join(userDataRoot(), 'profiles')
}

export function profileDir(id: string): string {
  return join(profilesRoot(), id)
}

export function coreHome(): string {
  return join(userDataRoot(), 'home')
}

/**
 * Paths mihomo may read via PUT /configs?path=… (SAFE_PATHS env).
 * Includes profile configs so hot-reload by path works after reconnect.
 */
export function mihomoSafePaths(): string {
  const sep = platform() === 'win32' ? ';' : ':'
  return [coreHome(), profilesRoot()].join(sep)
}

/** Directory containing bundled mihomo (+ wintun on Windows). */
export function bundledCoreDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'core')
  }
  return join(app.getAppPath(), 'resources', 'core')
}

export function bundledHelperDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'helper')
  }
  return join(app.getAppPath(), 'resources', 'helper')
}

export function coreBinaryName(): string {
  if (platform() === 'win32') return 'mihomo.exe'
  return 'mihomo'
}

export function helperBinaryName(): string {
  if (platform() === 'win32') return 'CheezyHelperService.exe'
  return 'cheezy-helper'
}

export function coreBinaryPath(): string {
  return join(bundledCoreDir(), coreBinaryName())
}

export function helperBinaryPath(): string {
  return join(bundledHelperDir(), helperBinaryName())
}

export function wintunPath(): string {
  return join(bundledCoreDir(), 'wintun.dll')
}

export function corePresent(): boolean {
  return existsSync(coreBinaryPath())
}

export function hostGoArch(): string {
  const a = arch()
  if (a === 'arm64') return 'arm64'
  if (a === 'ia32') return '386'
  return 'amd64'
}

export function hostGoos(): string {
  const p = platform()
  if (p === 'win32') return 'windows'
  if (p === 'darwin') return 'darwin'
  return 'linux'
}
