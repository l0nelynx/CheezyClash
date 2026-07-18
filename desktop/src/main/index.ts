import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  shell,
} from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import {
  connect,
  disconnect,
  getStatus,
  getTunStatus,
  setTunEnabled,
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
  ensureProfilesRoot,
  migrateOrphanDirs,
} from './profiles'
import { getSettings, setSettings, getOrCreateSecret } from './store'
import { getLogs, log } from './logger'
import { coreHome } from './paths'
import { PRIVATE_IPC } from '../shared/private-api'
import { getPrivateModule, loadPrivateModule } from './private-module'
import { syncManagedFromPrivate } from './private-sync'

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

function createWindow(): void {
  const icon = loadAppIcon()
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 560,
    show: false,
    title: 'CheezyClash',
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

function createTray(): void {
  tray = new Tray(loadTrayImage())
  tray.setToolTip('CheezyClash')
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show CheezyClash',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    { type: 'separator' },
    {
      label: 'Connect proxy',
      click: () => void connect('proxy').catch((e) => log(String(e), 'error')),
    },
    {
      label: 'Connect TUN',
      click: () => void connect('tun').catch((e) => log(String(e), 'error')),
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
  ipcMain.handle('proxies:groups', () => mihomoApi.getGroups())
  ipcMain.handle('proxies:select', (_e, group: string, name: string) =>
    mihomoApi.selectProxy(group, name),
  )
  ipcMain.handle('proxies:health', (_e, group: string) => mihomoApi.healthCheck(group))
  ipcMain.handle('profiles:list', () => listProfiles())
  ipcMain.handle('profiles:active', () => getActiveProfileId())
  ipcMain.handle('profiles:importUrl', (_e, url: string, name?: string) =>
    importFromUrl(url, name),
  )
  ipcMain.handle('profiles:importFile', () => importFromFileDialog())
  ipcMain.handle('profiles:setActive', async (_e, id: string) => {
    setActiveProfile(id)
    const st = await getStatus()
    if (st.running) await connect(st.mode)
  })
  ipcMain.handle('profiles:delete', (_e, id: string) => deleteProfile(id))
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch) => setSettings(patch))
  ipcMain.handle('tun:status', () => getTunStatus())
  ipcMain.handle('tun:setEnabled', (_e, enabled: boolean) => setTunEnabled(enabled))
  ipcMain.handle('helper:ensure', () => ensureHelperAndStatus())
  ipcMain.handle('logs:get', () => getLogs())

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
  createWindow()
  createTray()

  // Best-effort subscription refresh when already logged in
  if (caps.supportsAuth) {
    void syncManagedFromPrivate().catch((e) => log(String(e), 'warn'))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else mainWindow?.show()
  })
})

app.on('window-all-closed', () => {
  /* keep tray alive on Windows/Linux */
})

app.on('before-quit', () => {
  quitting = true
  void disconnect()
})

function mkdirSilent(p: string): void {
  try {
    require('fs').mkdirSync(p, { recursive: true })
  } catch {
    /* ignore */
  }
}

export function openExternal(url: string): void {
  void shell.openExternal(url)
}
