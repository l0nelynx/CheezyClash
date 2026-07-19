import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  shell,
  dialog,
} from 'electron'
import { join, basename } from 'path'
import { existsSync } from 'fs'
import {
  connect,
  disconnect,
  getStatus,
  getTunStatus,
  setTunEnabled,
  setConnectionMode,
  ensureHelperAndStatus,
  corePresent,
} from './core-manager'
import { mihomoApi } from './mihomo-api'
import {
  listProfiles,
  getActiveProfileId,
  importFromUrl,
  importFromFileDialog,
  setActiveProfile,
  deleteProfile,
  refreshProfile,
  ensureProfilesRoot,
  migrateOrphanDirs,
  rebuildActive,
  getActiveProxyGroupNames,
  getProxyGroupIcons,
  validateProcessNameRule,
} from './profiles'
import { getSettings, setSettings, getOrCreateSecret, getSelections, setSelection } from './store'
import { listRunningProcesses } from './processes'
import type { AccessControlRule, ConnectionMode } from '../shared/types'
import { getLogs, log } from './logger'
import { coreHome } from './paths'
import { PRIVATE_IPC } from '../shared/private-api'
import { getPrivateModule, loadPrivateModule } from './private-module'
import { syncManagedFromPrivate } from './private-sync'
import { resolveCoreVersionLabel } from './mihomo-label'
import {
  rescheduleSubscriptionUpdates,
  startSubscriptionUpdater,
  stopSubscriptionUpdater,
} from './subscription-updater'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

function resolveAsset(...parts: string[]): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, ...parts)
  }
  return join(app.getAppPath(), ...parts)
}

function loadAppIcon(): Electron.NativeImage | undefined {
  const candidates = [
    resolveAsset('build', 'icon.ico'),
    resolveAsset('build', 'icon.png'),
    join(app.getAppPath(), 'build', 'icon.ico'),
    join(app.getAppPath(), 'build', 'icon.png'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      const img = nativeImage.createFromPath(p)
      if (!img.isEmpty()) return img
    }
  }
  return undefined
}

function loadTrayImage(): Electron.NativeImage {
  const candidates = [
    resolveAsset('tray.png'),
    resolveAsset('resources', 'tray.png'),
    resolveAsset('build', 'icon.png'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      const img = nativeImage.createFromPath(p)
      if (!img.isEmpty()) return img
    }
  }
  return nativeImage.createEmpty()
}

function createWindow(productName: string): void {
  const icon = loadAppIcon()
  mainWindow = new BrowserWindow({
    width: 800,
    height: 700,
    minWidth: 800,
    minHeight: 560,
    show: false,
    title: productName,
    backgroundColor: '#0f1117',
    frame: false,
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized', false)
  })
  mainWindow.on('close', (e) => {
    if (quitting || process.platform === 'darwin') return
    e.preventDefault()
    mainWindow?.hide()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(productName: string): void {
  tray = new Tray(loadTrayImage())
  tray.setToolTip(productName)
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Show ${productName}`,
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    { type: 'separator' },
    {
      label: 'Connect',
      click: () => void connect().catch((e) => log(String(e), 'error')),
    },
    {
      label: 'Disconnect',
      click: () => void disconnect().catch((e) => log(String(e), 'error')),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: async () => {
        quitting = true
        await disconnect().catch(() => undefined)
        app.exit(0)
      },
    },
  ])
  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

function registerIpc(): void {
  ipcMain.handle('core:status', () => getStatus())
  ipcMain.handle('core:connect', (_e, mode) => connect(mode))
  ipcMain.handle('core:disconnect', () => disconnect())
  ipcMain.handle('core:traffic', () => mihomoApi.getTraffic())
  ipcMain.handle('proxies:groups', async () => {
    const groups = await mihomoApi.getGroups()
    const icons = getProxyGroupIcons()
    return groups.map((g) => {
      const icon = icons[g.name]
      return icon ? { ...g, icon } : g
    })
  })
  ipcMain.handle('proxies:select', async (_e, group: string, name: string) => {
    await mihomoApi.selectProxy(group, name)
    setSelection(group, name)
    // Existing flows keep the old outbound until closed — flush so TUN/proxy pick up the new node.
    await mihomoApi.closeAllConnections()
    return true
  })
  ipcMain.handle('proxies:health', (_e, group: string) => mihomoApi.healthCheck(group))
  ipcMain.handle('profiles:list', () => listProfiles())
  ipcMain.handle('profiles:active', () => getActiveProfileId())
  ipcMain.handle('profiles:importUrl', async (_e, url: string, name?: string) => {
    const meta = await importFromUrl(url, name)
    rescheduleSubscriptionUpdates()
    return meta
  })
  ipcMain.handle('profiles:importFile', () => importFromFileDialog())
  ipcMain.handle('profiles:setActive', async (_e, id: string) => {
    setActiveProfile(id)
    const st = await getStatus()
    if (st.running) await connect(st.mode)
  })
  ipcMain.handle('profiles:delete', (_e, id: string) => {
    deleteProfile(id)
    rescheduleSubscriptionUpdates()
  })
  ipcMain.handle('profiles:update', async (_e, id: string) => {
    const meta = await refreshProfile(id, { reloadCore: true })
    rescheduleSubscriptionUpdates()
    return meta
  })
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch) => setSettings(patch))
  ipcMain.handle('tun:status', () => getTunStatus())
  ipcMain.handle('tun:setEnabled', (_e, enabled: boolean) => setTunEnabled(enabled))
  ipcMain.handle('connection:setMode', (_e, mode: ConnectionMode) => setConnectionMode(mode))
  ipcMain.handle('helper:ensure', () => ensureHelperAndStatus())
  ipcMain.handle('logs:get', () => getLogs())

  ipcMain.handle('processes:list', () => listRunningProcesses())
  ipcMain.handle('profiles:proxyGroupNames', () => getActiveProxyGroupNames())
  ipcMain.handle('accessControl:validate', (_e, processName: string, policy: string) =>
    validateProcessNameRule(processName, policy),
  )
  ipcMain.handle('accessControl:set', async (_e, rules: AccessControlRule[]) => {
    for (const r of rules) {
      validateProcessNameRule(r.processName, r.policy)
    }
    const settings = setSettings({ accessControlRules: rules })
    const path = rebuildActive(settings)
    if (!path) return settings
    const st = await getStatus()
    if (st.running) {
      mihomoApi.ensureSecretFromStore()
      // Soft apply: force-reload YAML (rules) without restarting the core process.
      await mihomoApi.putConfigs(path)
      // Reload resets selectors to profile defaults — restore user choices.
      await mihomoApi.applySelections(getSelections())
      await mihomoApi.closeAllConnections()
    }
    return settings
  })
  ipcMain.handle('dialog:pickExecutable', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select executable',
      filters: [
        { name: 'Executable', extensions: ['exe'] },
        { name: 'All', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return basename(result.filePaths[0])
  })

  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('core:version', async () => {
    const labeled = resolveCoreVersionLabel()
    if (labeled.version !== 'unknown') {
      return { version: labeled.version, source: labeled.source }
    }
    try {
      mihomoApi.ensureSecretFromStore()
      const v = await mihomoApi.getVersion()
      return { version: v.version || 'unknown', source: 'api', meta: v.meta }
    } catch {
      return { version: 'unknown', source: 'none' }
    }
  })
  ipcMain.handle('app:checkUpdate', async () => {
    const caps = getPrivateModule().capabilities()
    const repo = caps.supportsAuth ? 'l0nelynx/CheezyVPN-Releases' : 'l0nelynx/CheezyClash'
    const releasesUrl = `https://github.com/${repo}/releases`
    const current = app.getVersion()
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `${caps.productName}-Desktop`,
        },
      })
      if (!res.ok) {
        return {
          current,
          latest: null,
          updateAvailable: false,
          releasesUrl,
          error: `GitHub ${res.status}`,
        }
      }
      const data = (await res.json()) as { tag_name?: string }
      const latest = (data.tag_name || '').replace(/^v/i, '')
      const updateAvailable = !!latest && latest !== current && compareSemver(latest, current) > 0
      return { current, latest: latest || null, updateAvailable, releasesUrl }
    } catch (e) {
      return {
        current,
        latest: null,
        updateAvailable: false,
        releasesUrl,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  })
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('invalid url')
    }
    void shell.openExternal(url)
  })

  ipcMain.handle(PRIVATE_IPC.capabilities, () => getPrivateModule().capabilities())
  ipcMain.handle(PRIVATE_IPC.accountGetSession, () => getPrivateModule().getSession())
  ipcMain.handle(PRIVATE_IPC.accountLogin, async (_e, email: string, password: string) => {
    const session = await getPrivateModule().login(email, password)
    await syncManagedFromPrivate().catch((err) => log(String(err), 'warn'))
    return session
  })
  ipcMain.handle(PRIVATE_IPC.accountLogout, () => getPrivateModule().logout())
  ipcMain.handle(PRIVATE_IPC.subscriptionFetch, () => getPrivateModule().fetchSubscription())
  ipcMain.handle(PRIVATE_IPC.subscriptionUserInfo, async () => {
    const info = await getPrivateModule().fetchSubscription()
    if (!info) return null
    return {
      upload: info.upload ?? 0,
      download: info.download ?? 0,
      total: info.total ?? 0,
      expire: info.expire ?? 0,
      title: info.title,
    }
  })
  ipcMain.handle(PRIVATE_IPC.subscriptionSync, () => syncManagedFromPrivate())

  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.handle('window:maximizeToggle', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return false
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })
  ipcMain.handle('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
  ipcMain.handle('window:isMaximized', (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
  })
}

app.whenReady().then(() => {
  // Hide File/Edit/View application menu
  Menu.setApplicationMenu(null)

  const priv = loadPrivateModule()
  const caps = priv.capabilities()
  app.setName(caps.productName)
  if (process.platform === 'win32') {
    app.setAppUserModelId(
      caps.supportsAuth ? 'com.cheezy.vpn.desktop' : 'com.cheezy.freedom.desktop',
    )
  }

  getOrCreateSecret()
  ensureProfilesRoot()
  migrateOrphanDirs()
  mkdirSilent(coreHome())

  if (!corePresent()) {
    log('mihomo binary not found — run npm run fetch-core', 'warn')
  }

  registerIpc()
  createWindow(caps.productName)
  createTray(caps.productName)

  // Best-effort subscription refresh when already logged in
  if (caps.supportsAuth) {
    void syncManagedFromPrivate().catch((e) => log(String(e), 'warn'))
  }

  startSubscriptionUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(caps.productName)
    else mainWindow?.show()
  })
})

app.on('window-all-closed', () => {
  /* keep tray alive on Windows/Linux */
})

app.on('before-quit', () => {
  quitting = true
  stopSubscriptionUpdater()
  void disconnect()
})

function mkdirSilent(p: string): void {
  try {
    require('fs').mkdirSync(p, { recursive: true })
  } catch {
    /* ignore */
  }
}

/** Compare dotted versions; positive if a > b. */
function compareSemver(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((x) => parseInt(x, 10) || 0)
  const pb = b.split(/[.+-]/).map((x) => parseInt(x, 10) || 0)
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

export function openExternal(url: string): void {
  void shell.openExternal(url)
}
