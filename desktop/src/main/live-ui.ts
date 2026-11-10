/** Standalone live renderer host. Never imports core-manager, store or helper lifecycle. */
import { app, BrowserWindow, ipcMain, Menu, session, shell } from 'electron'
import { readFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { MihomoApi } from './mihomo-api'
import { PublicIpMonitor } from './public-ip-monitor'
import { publicIpProxy } from './public-ip-proxy'
import { normalizeSettings, type AppSettings, type CoreStatus, type ProfileMeta } from '../shared/types'
import { PRIVATE_IPC } from '../shared/private-api'
import { DEEP_LINK_IPC } from '../shared/deep-link'

const source = process.env.CHEEZY_LIVE_SOURCE
const dataRoot = process.env.CHEEZY_LIVE_DATA
if (!source || !dataRoot) throw new Error('Use npm run preview:live -- --source <installed user-data directory>')
app.setPath('userData', resolve(dataRoot))
app.setName('CheezyClash Live UI')
type InstalledState = { profiles: ProfileMeta[]; activeProfileId: string | null; settings: AppSettings; controllerRuntime?: { secret?: string; profileId?: string } }
const readSource = (): InstalledState => JSON.parse(readFileSync(join(source, 'cheezy-desktop.json'), 'utf8'))
const api = new MihomoApi()
let auth: string | undefined
let win: BrowserWindow
let liveConfig: { 'mixed-port'?: number; port?: number; 'socks-port'?: number; tun?: { enable?: boolean } } = {}
let status: CoreStatus = { running: false, mode: 'proxy', controller: '127.0.0.1:9090', secret: '', helperReady: false, privilegesOk: false, readOnly: true }
const blocked = (): never => { throw new Error('Connection and profile changes are managed by the running client.') }
function syncSource(): InstalledState {
  const current = readSource()
  const secret = current.controllerRuntime?.secret
  if (typeof secret !== 'string') throw new Error('The running client has no saved controller credentials.')
  if (auth !== secret) { auth = secret; api.setAuth('127.0.0.1', 9090, secret) }
  return current
}
const ip = new PublicIpMonitor(async (url, signal) => {
  const config = await api.request<typeof liveConfig>('GET', '/configs', undefined, 3000)
  signal.throwIfAborted()
  const isolated = session.fromPartition('live-public-ip', { cache: false })
  await isolated.closeAllConnections()
  await isolated.setProxy(publicIpProxy(config))
  signal.throwIfAborted()
  return isolated.fetch(url, { signal, cache: 'no-store', credentials: 'omit', redirect: 'error' })
})
let routeKey = ''
async function refresh(): Promise<void> {
  try {
    const current = syncSource()
    const [config, proxies] = await Promise.all([
      api.request<typeof liveConfig>('GET', '/configs', undefined, 3000), api.getProxies(),
    ])
    liveConfig = config
    status = { ...status, running: true, mode: config.tun?.enable ? 'tun' : 'proxy', lastError: undefined }
    const next = JSON.stringify([current.controllerRuntime?.profileId, status.mode,
      Object.entries(proxies).filter(([, p]) => typeof p.now === 'string').map(([name, p]) => [name, p.now]).sort()])
    if (next !== routeKey) { routeKey = next; ip.setRoute(next) }
  } catch {
    status = { ...status, running: false, lastError: 'Could not reach the running core.' }
    routeKey = ''; ip.setRoute(null)
  }
  if (win && !win.isDestroyed()) win.webContents.send('core:statusChanged', status)
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  await refresh()
  if (!status.running) throw new Error('Cannot attach: the existing controller is unavailable.')
  const handle = (channel: string, fn: (...args: any[]) => unknown): void => { ipcMain.handle(channel, (_event, ...args) => fn(...args)) }
  handle('core:status', () => status)
  handle('core:traffic', () => api.getTraffic())
  handle('connections:list', () => api.getConnections())
  handle('proxies:groups', () => api.getGroups())
  handle('connection:publicIp', () => ip.snapshot())
  handle('profiles:list', () => syncSource().profiles)
  handle('profiles:active', () => syncSource().activeProfileId)
  handle('settings:get', () => normalizeSettings(syncSource().settings))
  handle('tun:status', () => ({ enabled: !!liveConfig.tun?.enable, helperInstalled: false, helperRunning: false, privilegesOk: false }))
  handle('logs:get', () => [])
  handle('app:getVersion', () => JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')).version)
  handle('core:version', () => api.getVersion())
  handle(PRIVATE_IPC.capabilities, () => ({ supportsAuth: false, productName: 'CheezyClash · Live UI', deepLinkScheme: 'cheezyclash' }))
  handle(PRIVATE_IPC.accountGetSession, () => null)
  handle(DEEP_LINK_IPC.consumeResult, () => null)
  handle('profiles:cancelDownloads', () => undefined)
  handle('customRules:context', async () => ({ proxyGroups: (await api.getGroups()).map(g => g.name), proxyNames: [], ruleSets: [], subRules: [], profiles: [], platform: process.platform, activeProfileId: syncSource().activeProfileId }))
  handle('shell:openExternal', (url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('Unsupported URL')
    return shell.openExternal(url)
  })
  // Explicit deny-list of production mutations. There is no core lifecycle in this process.
  for (const channel of ['core:connect','core:disconnect','core:connectProxy','proxies:select','proxies:health',
    'profiles:importUrl','profiles:importFile','profiles:setActive','profiles:update','profiles:delete',
    'settings:set','tun:setEnabled','connection:setMode','helper:ensure','helper:repair','helper:remove',
    'customRules:set','customRules:validate','accessControl:set','accessControl:validate','app:checkUpdate',
    'dashboard:open',PRIVATE_IPC.subscriptionSync,PRIVATE_IPC.accountLogout]) handle(channel, blocked)
  handle('app:quit', () => app.quit())
  handle('window:close', () => win.close())
  handle('window:minimize', () => win.minimize())
  handle('window:isMaximized', () => win.isMaximized())
  handle('window:maximizeToggle', () => { if (win.isMaximized()) win.unmaximize(); else win.maximize(); return win.isMaximized() })
  win = new BrowserWindow({ width: 800, height: 700, minWidth: 800, minHeight: 560, show: false, frame: false,
    backgroundColor: '#000000', title: 'CheezyClash · Live UI',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: false } })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.on('maximize', () => win.webContents.send('window:maximized', true))
  win.on('unmaximize', () => win.webContents.send('window:maximized', false))
  const lang = process.env.CHEEZY_LIVE_LANGUAGE === 'ru' ? 'ru' : 'en'
  await win.loadFile(join(__dirname, '../renderer/index.html'))
  await win.webContents.executeJavaScript(`localStorage.setItem('cheezy-language', ${JSON.stringify(lang)}); localStorage.setItem('cheezy-theme', 'dark')`)
  await win.loadFile(join(__dirname, '../renderer/index.html'))
  win.show(); win.focus()
  let polling = false
  const timer = setInterval(() => {
    if (polling) return
    polling = true
    void refresh().finally(() => { polling = false })
  }, 15_000)
  app.on('before-quit', () => { clearInterval(timer); api.stopTraffic(); ip.setRoute(null) })
  // Local verification artifact contains layout checks only, never credentials or subscription URLs.
  setTimeout(async () => {
    if (win.isDestroyed()) return
    const checks = await win.webContents.executeJavaScript(`({language:document.documentElement.lang, running:document.querySelector('[data-testid=core-status]')?.dataset.state, connectionLabel:document.querySelector('[data-testid=vpn-widget] h2')?.textContent, powerDisabled:document.querySelector('[data-testid=power-button]')?.disabled, fits:document.querySelector('main').scrollHeight<=document.querySelector('main').clientHeight})`)
    console.log('Live UI ready:', JSON.stringify(checks))
    if (process.env.CHEEZY_LIVE_CAPTURE) {
      const { writeFileSync } = await import('node:fs')
      mkdirSync(dataRoot, { recursive: true })
      writeFileSync(join(dataRoot, 'live-ui.png'), (await win.webContents.capturePage()).toPNG())
    }
  }, 4000)
}).catch(() => { console.error('Live UI could not attach. Existing client and core were left running.'); app.quit() })
app.on('window-all-closed', () => app.quit())
