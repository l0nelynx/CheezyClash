import { app, BrowserWindow, ipcMain, net, Notification, shell } from 'electron'
import type { BaseUpdater } from 'electron-updater'
import { mkdir, rename, rm } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable, Transform } from 'node:stream'
import { getSettings } from './store'
import { installationFormat, installPackage, nativeDownloader } from './update-platform'
import { newer, repositories, selectAsset, verifyFile, type Edition, type UpdateAsset } from './update-manifest'
import type { DesktopUpdate } from '../shared/desktop-update'

declare const __UPDATE_EDITION__: Edition
declare const __UPDATE_PUBLIC_KEY__: string

export function registerDesktopUpdates(prepare: () => Promise<void>, resume: () => void, finish: () => void, reveal: () => void): void {
  const edition = __UPDATE_EDITION__
  const repo = repositories[edition]
  const releasesUrl = 'https://github.com/' + repo + '/releases'
  const current = app.getVersion()
  let state: DesktopUpdate = { current, releasesUrl, phase: 'idle' }
  let selected: UpdateAsset | undefined
  let native: BaseUpdater | undefined
  let path: string | undefined
  let active: Promise<void> | undefined
  let notified = ''
  let notification: Notification | undefined

  function publish(patch: Partial<DesktopUpdate>) {
    state = { ...state, ...patch }
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('update:changed', state)
  }
  function progress(value: number) {
    const percent = Math.floor(value)
    if (state.progress !== percent) publish({ progress: percent })
  }
  function once(work: () => Promise<void>) {
    if (!active) active = Promise.resolve().then(work).catch(error => {
      publish({ phase: path ? 'ready' : 'error', error: error instanceof Error ? error.message : String(error) })
    }).finally(() => { active = undefined })
    return active
  }
  async function request(url: string, timeout = 30000) {
    const response = await net.fetch(url, { signal: AbortSignal.timeout(timeout), cache: 'no-store' })
    if (!response.ok) throw new Error('GitHub HTTP ' + response.status)
    return response
  }
  function assetUrl(name: string) {
    return new URL(releasesUrl + '/download/v' + state.latest + '/' + name)
  }

  async function download() {
    if (!selected || !state.latest || path) return
    const asset = selected
    const url = assetUrl(asset.name)
    publish({ phase: 'downloading', progress: 0, error: undefined })
    let completed: string
    if (asset.format === 'zip' || asset.format === 'dmg') {
      const dir = join(app.getPath('userData'), 'desktop-updates', edition)
      await mkdir(dir, { recursive: true })
      completed = join(dir, asset.name)
      if (!await verifyFile(completed, asset).then(() => true, () => false)) {
        const partial = completed + '.part'
        try {
          const response = await request(url.href, 30 * 60_000)
          if (!response.body) throw new Error('Empty update response')
          let received = 0
          const meter = new Transform({ transform(chunk, _encoding, next) {
            received += chunk.length
            if (received > asset.size) return next(new Error('Desktop update exceeds its signed size'))
            progress(received * 100 / asset.size)
            next(null, chunk)
          } })
          await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), meter, createWriteStream(partial, { mode: 0o600 }))
          await verifyFile(partial, asset)
          await rename(partial, completed)
        } finally { await rm(partial, { force: true }) }
      }
    } else {
      native = nativeDownloader(asset, state.latest, url, progress)
      if (!(await native.checkForUpdates())?.isUpdateAvailable) throw new Error('Update unavailable for this installation')
      const [downloaded] = await native.downloadUpdate()
      if (!downloaded) throw new Error('Missing downloaded update')
      completed = downloaded
      await verifyFile(completed, asset)
    }
    path = completed
    publish({ phase: 'ready', progress: 100 })
    if (notified !== state.latest && Notification.isSupported()) {
      notified = state.latest!
      const ru = app.getLocale().startsWith('ru')
      notification = new Notification({ title: edition + ' ' + notified,
        body: ru ? 'Обновление готово. Откройте раздел «О программе».' : 'Update ready. Open About to install.' })
      notification.on('click', reveal)
      notification.show()
    }
  }

  async function check() {
    const previous = state
    publish({ phase: 'checking', error: undefined })
    try {
      const { tag_name: tag } = await (await request('https://api.github.com/repos/' + repo + '/releases/latest')).json()
      const version = String(tag).replace(/^v/, '')
      if (!newer(version, current)) {
        path = undefined
        selected = undefined
        publish({ phase: 'current', latest: undefined, format: undefined, showFile: false })
        return
      }
      if (previous.latest === version && path) {
        publish({ phase: 'ready' })
        return
      }
      selected = undefined
      native = undefined
      path = undefined
      const format = await installationFormat(edition)
      publish({ latest: version, format, showFile: false, progress: undefined })
      if (!format || !__UPDATE_PUBLIC_KEY__) { publish({ phase: 'manual' }); return }
      const [raw, signature] = await Promise.all(['desktop-update.json', 'desktop-update.sig'].map(async name =>
        Buffer.from(await (await request(assetUrl(name).href)).arrayBuffer())))
      selected = selectAsset(raw, signature, __UPDATE_PUBLIC_KEY__, edition, version, process.platform, process.arch, format)
      publish({ phase: 'available' })
      if (getSettings().autoDownloadUpdates) await download()
    } catch (error) {
      if (path) publish(previous)
      throw error
    }
  }

  async function install(showOnly = false) {
    if (!path || !selected || state.phase !== 'ready') return
    try { await verifyFile(path, selected) } catch (error) {
      const invalid = path
      path = undefined
      await rm(invalid, { force: true })
      throw error
    }
    if (showOnly) { shell.showItemInFolder(path); return }
    publish({ phase: 'installing', error: undefined })
    let preparing = false
    try {
      const outcome = await installPackage(selected, path, native, async () => {
        preparing = true
        await prepare()
      })
      if (outcome === 'quit') finish()
      else publish({ phase: 'ready' })
    } catch (error) {
      if (preparing) resume()
      publish({ phase: 'ready', showFile: true })
      throw error
    }
  }
  ipcMain.handle('update:state', () => state)
  ipcMain.handle('app:checkUpdate', () => once(check).then(() => state))
  ipcMain.handle('update:download', () => once(download))
  ipcMain.handle('update:install', () => once(() => install()))
  ipcMain.handle('update:showFile', () => once(() => install(true)))
  if (app.isPackaged) {
    const first = setTimeout(() => void once(check), 10000)
    const timer = setInterval(() => void once(check), 6 * 60 * 60_000)
    app.once('will-quit', () => { clearTimeout(first); clearInterval(timer) })
  }
}
