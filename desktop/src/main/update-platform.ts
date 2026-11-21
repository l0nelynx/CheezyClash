import { app, shell } from 'electron'
import { AppImageUpdater, DebUpdater, NsisUpdater, Provider, type BaseUpdater, type UpdateInfo } from 'electron-updater'
import type { ProviderRuntimeOptions } from 'electron-updater/out/providers/Provider'
import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, chmod, copyFile, mkdtemp, realpath, rename, rm, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep, win32 } from 'node:path'
import { promisify } from 'node:util'
import { v5 } from 'uuid'
import type { UpdateFormat } from '../shared/desktop-update'
import { verifyFile, type Edition, type UpdateAsset } from './update-manifest'

const run = promisify(execFile)
const powershell = () => join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')

export async function installationFormat(edition: Edition): Promise<UpdateFormat | undefined> {
  if (!app.isPackaged) return
  if (process.platform === 'darwin') return 'dmg'
  if (process.platform === 'linux') {
    const exe = await realpath(process.execPath)
    if (process.env.APPIMAGE && process.env.APPDIR && isAbsolute(process.env.APPIMAGE) && isAbsolute(process.env.APPDIR)) {
      const insideMount = relative(await realpath(process.env.APPDIR), exe)
      if (!isAbsolute(insideMount) && !insideMount.startsWith('..' + sep) && insideMount !== '..' &&
          (await stat(process.env.APPIMAGE)).isFile()) return 'AppImage'
    }
    // Both published DEBs historically use this package name. Verify ownership of this executable.
    const { stdout } = await run('/usr/bin/dpkg-query', ['-S', exe]).catch(() => ({ stdout: '' }))
    return stdout.trim() === 'cheezyclash-desktop: ' + exe ? 'deb' : undefined
  }
  if (process.platform !== 'win32') return
  const id = edition === 'CheezyVPN' ? 'com.cheezy.vpn.desktop' : 'com.cheezy.freedom.desktop'
  const guid = v5(id, '50e065bc-3134-11e6-9bab-38c9862bdaf3')
  const command = [
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
    ...['HKCU', 'HKLM'].map(hive =>
      `(Get-ItemProperty -LiteralPath '${hive}:\\Software\\${guid}' -ErrorAction SilentlyContinue).InstallLocation`),
    'exit 0',
  ].join('; ')
  const { stdout } = await run(powershell(), ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 10000 })
  const here = win32.normalize(dirname(process.execPath)).toLowerCase()
  return stdout.split(/\r?\n/).some(p => p && win32.resolve(p.trim()).toLowerCase() === here) ? 'nsis' : 'zip'
}

// Supply only the file selected from the already authenticated manifest.
export function nativeDownloader(asset: UpdateAsset, version: string, url: URL, progress: (percent: number) => void): BaseUpdater {
  const file = { url: asset.name, size: asset.size, sha512: asset.sha512, isAdminRightsRequired: asset.format === 'nsis' }
  class ReleaseProvider extends Provider<UpdateInfo> {
    constructor(_options: unknown, _updater: unknown, runtime: ProviderRuntimeOptions) { super(runtime) }
    async getLatestVersion() {
      return { version, files: [file], path: file.url, sha512: file.sha512, releaseDate: '' }
    }
    resolveFiles() { return [{ url, info: file }] }
  }
  const updater = asset.format === 'nsis' ? new NsisUpdater() :
    asset.format === 'deb' ? new DebUpdater() : new AppImageUpdater()
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  updater.disableDifferentialDownload = true
  updater.disableWebInstaller = true
  updater.updateConfigPath = join(app.getAppPath(), 'package.json')
  updater.setFeedURL({ provider: 'custom', updateProvider: ReleaseProvider })
  updater.on('download-progress', event => progress(event.percent))
  return updater
}

export async function installPackage(asset: UpdateAsset, path: string,
  prepare: () => Promise<void>): Promise<'opened' | 'quit'> {
  if (asset.format === 'zip') {
    shell.showItemInFolder(path)
    return 'opened'
  }
  if (asset.format === 'dmg') {
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
    return 'opened'
  }
  if (asset.format === 'AppImage') {
    const destination = await realpath(process.env.APPIMAGE!)
    // Stage on the same filesystem so even a failed copy or rename leaves a launchable app.
    const dir = await mkdtemp(join(dirname(destination), '.cheezy-update-'))
    try {
      const staged = join(dir, 'update.AppImage')
      await copyFile(path, staged, constants.COPYFILE_EXCL)
      await verifyFile(staged, asset)
      await chmod(staged, (await stat(destination)).mode & 0o777)
      await prepare()
      await rename(staged, destination)
    } finally { await rm(dir, { recursive: true, force: true }) }
    app.relaunch({ execPath: destination })
  } else if (asset.format === 'deb') {
    await access('/usr/bin/pkexec', constants.X_OK)
    await access('/usr/bin/apt-get', constants.X_OK)
    await prepare()
    await run('/usr/bin/pkexec', ['--disable-internal-agent', '/usr/bin/apt-get', '--yes', '--no-remove', 'install', path])
    app.relaunch()
  } else {
    await prepare()
    // Wait for ShellExecute to accept the elevated launch. The NSIS wizard then runs independently.
    // A cancelled UAC prompt rejects here, keeping the verified installer available for retry.
    await run(powershell(), ['-NoProfile', '-NonInteractive', '-Command',
      "$ErrorActionPreference = 'Stop'; Start-Process -FilePath $env:CHEEZY_UPDATE_INSTALLER -ArgumentList '--updated','--force-run' -Verb RunAs"],
      { windowsHide: true, env: { ...process.env, CHEEZY_UPDATE_INSTALLER: path } })
  }
  return 'quit'
}
