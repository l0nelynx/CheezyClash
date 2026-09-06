import { stopHelperOnExit } from './helper'
import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, dialog } from 'electron'
import { join, basename } from 'path'
import { existsSync } from 'fs'
import {
  connect,
  disconnect,
  getStatus,
  getTunStatus,
  setTunEnabled,
  setConnectionMode,
  switchProfile,
  syncManagedSystemProxy,
  ensureHelperAndStatus,
  corePresent,
  restoreControllerAuth,
  reloadActiveConfig,
  getDashboardUrl,
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
  getActiveCustomRuleContext,
  getActiveProxyGroupNames,
  getProxyGroupIcons,
  validateProcessNameRule,
} from './profiles'
import { getSettings, setSettings, setSelection, isSystemProxyOwned } from './store'
import { listRunningProcesses } from './processes'
import type { AccessControlRule, ConnectionMode } from '../shared/types'
import type { CustomRule } from '../shared/custom-rules'
import { normalizeCustomRules, validateCustomRule } from '../shared/custom-rules'
import { getLogs, log } from './logger'
import { coreHome } from './paths'
import { PRIVATE_IPC, type PrivateCapabilities } from '../shared/private-api'
import {
  DEEP_LINK_IPC,
  deepLinkLogLabel,
  parseDeepLink,
  type DeepLinkResult,
  type DeepLinkResultPayload,
} from '../shared/deep-link'
import { getPrivateModule, loadPrivateModule } from './private-module'
import { syncManagedFromPrivate } from './private-sync'
import { isUsefulCoreLabel, resolveCoreVersionLabel } from './mihomo-label'
import {
  rescheduleSubscriptionUpdates,
  startSubscriptionUpdater,
  stopSubscriptionUpdater,
} from './subscription-updater'
import { notifyProfilesChanged } from './profile-events'
import { applyAutoStart, isSystemStartupLaunch, type StartupIdentity } from './startup'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let quitCleanupDone = false
let quitCleanupStarted = false
let trayProductName = 'CheezyClash'
/** Queued until the window is ready (cold-start deeplink). */
let pendingDeepLink: string | null = null
/** Buffered so a cold-start result cannot race ahead of the renderer listener. */
let pendingDeepLinkResult: DeepLinkResult | null = null
let deepLinkResultSequence = 0

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

function createWindow(productName: string, showOnReady = true): void {
  const icon = loadAppIcon()
  mainWindow = new BrowserWindow({
    width: 800,
    height: 700,
    minWidth: 800,
    minHeight: 560,
    show: false,
    title: productName,
    backgroundColor: '#212121',
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

  mainWindow.on('ready-to-show', () => {
    if (showOnReady) mainWindow?.show()
  })
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

function revealMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.moveTop()
  mainWindow.focus()
}

function createTray(productName: string): void {
  trayProductName = productName
  tray = new Tray(loadTrayImage())
  tray.on('double-click', () => {
    revealMainWindow()
  })
  void refreshTrayMenu()
}

async function refreshTrayMenu(): Promise<void> {
  if (!tray) return
  let running = false
  let modeLabel = ''
  try {
    const st = await getStatus()
    running = st.running
    modeLabel = st.mode === 'tun' ? 'TUN' : 'Proxy'
    tray.setToolTip(
      running
        ? `${trayProductName} · Connected (${modeLabel})`
        : `${trayProductName} · Disconnected`,
    )
  } catch {
    tray.setToolTip(trayProductName)
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Show ${trayProductName}`,
      click: () => {
        revealMainWindow()
      },
    },
    { type: 'separator' },
    {
      label: running ? 'Connected' : 'Connect',
      enabled: !running,
      click: () => {
        void connect()
          .then(() => refreshTrayMenu())
          .catch((e) => {
            dialog.showErrorBox('Connect failed', String(e))
            void refreshTrayMenu()
          })
      },
    },
    {
      label: 'Disconnect',
      enabled: running,
      click: () => {
        void disconnect()
          .then(() => refreshTrayMenu())
          .catch((e) => {
            dialog.showErrorBox('Disconnect failed', String(e))
            void refreshTrayMenu()
          })
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        quitting = true
        app.quit()
      },
    },
  ])
  tray.setContextMenu(contextMenu)
}

const subscriptionDownloads = new Map<number, Set<AbortController>>()

async function withSubscriptionDownload<T>(event: Electron.IpcMainInvokeEvent, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const downloads = subscriptionDownloads.get(event.sender.id) ?? new Set<AbortController>()
  subscriptionDownloads.set(event.sender.id, downloads)
  downloads.add(controller)
  const abort = (): void => controller.abort()
  event.sender.once('destroyed', abort)
  try { return await work(controller.signal) } finally {
    event.sender.removeListener('destroyed', abort)
    downloads.delete(controller)
    if (!downloads.size) subscriptionDownloads.delete(event.sender.id)
  }
}

function registerIpc(): void {
  ipcMain.handle('profiles:cancelDownloads', (event) => {
    for (const controller of subscriptionDownloads.get(event.sender.id) ?? []) controller.abort()
  })
  ipcMain.handle('core:status', async () => {
    const st = await getStatus()
    void refreshTrayMenu()
    return st
  })
  ipcMain.handle('core:connect', async (_e, mode) => {
    const st = await connect(mode)
    void refreshTrayMenu()
    return st
  })
  ipcMain.handle('core:disconnect', async () => {
    const st = await disconnect()
    void refreshTrayMenu()
    return st
  })
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
    const meta = await withSubscriptionDownload(_e, signal => importFromUrl(url, name, signal))
    rescheduleSubscriptionUpdates()
    notifyProfilesChanged()
    return meta
  })
  ipcMain.handle('profiles:importFile', async () => {
    const meta = await importFromFileDialog()
    if (meta) notifyProfilesChanged()
    return meta
  })
  ipcMain.handle('profiles:setActive', async (_e, id: string) => {
    setActiveProfile(id)
    notifyProfilesChanged()
    await switchProfile(id)
  })
  ipcMain.handle('profiles:delete', async (_e, id: string) => {
    const wasActive = deleteProfile(id)
    rescheduleSubscriptionUpdates()
    notifyProfilesChanged()
    if (!wasActive) return
    const profileId = getActiveProfileId()
    if (!profileId) {
      await disconnect()
      return
    }
    await switchProfile(profileId)
  })
  ipcMain.handle('profiles:update', async (_e, id: string) => {
    const meta = await withSubscriptionDownload(_e, signal => refreshProfile(id, { reloadCore: true, signal }))
    rescheduleSubscriptionUpdates()
    notifyProfilesChanged()
    return meta
  })
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', async (_e, patch) => {
    const previous = getSettings()
    if (typeof patch.autoStart === 'boolean' && patch.autoStart !== previous.autoStart) {
      applyAutoStart(app, patch.autoStart, startupIdentity())
    }
    const settings = setSettings(patch)
    const st = await getStatus()
    const changesMode =
      settings.networkOverrideEnabled &&
      (patch.connectionMode !== undefined || patch.tunEnabled !== undefined)
    const changesOverride = patch.networkOverrideEnabled !== undefined
    if (changesOverride || changesMode) {
      if (st.running) {
        await connect(settings.connectionMode, 'cold-start', getActiveProfileId())
      } else {
        rebuildActive(settings)
      }
      const current = await getStatus()
      await syncManagedSystemProxy(current.running)
      return settings
    }

    const changesXrayMux =
      patch.xrayMuxEnabled !== undefined ||
      patch.xrayMuxConcurrency !== undefined ||
      patch.xrayMuxMaxConnections !== undefined ||
      patch.xrayMuxMaxDialsPerMinute !== undefined
    const needsLiveReload =
      changesXrayMux ||
      (settings.networkOverrideEnabled &&
        (patch.mixedPort !== undefined ||
          patch.allowLan !== undefined ||
          patch.tunStack !== undefined ||
          patch.tunMtu !== undefined))

    if (needsLiveReload) {
      const path = rebuildActive(settings)
      if (path && st.running) {
        const profileId = getActiveProfileId()
        if (profileId) {
          await reloadActiveConfig(path, profileId)
        }
      }
    }
    if (patch.systemProxy !== undefined || (needsLiveReload && patch.mixedPort !== undefined)) {
      await syncManagedSystemProxy(st.running)
    }
    return settings
  })
  ipcMain.handle('tun:status', () => getTunStatus())
  ipcMain.handle('tun:setEnabled', (_e, enabled: boolean) => setTunEnabled(enabled))
  ipcMain.handle('connection:setMode', (_e, mode: ConnectionMode) => setConnectionMode(mode))
  ipcMain.handle('helper:ensure', () => ensureHelperAndStatus())
  ipcMain.handle('logs:get', () => getLogs())

  ipcMain.handle('processes:list', () => listRunningProcesses())
  ipcMain.handle('profiles:proxyGroupNames', () => getActiveProxyGroupNames())
  ipcMain.handle('customRules:context', () => getActiveCustomRuleContext())
  ipcMain.handle('customRules:validate', (_e, rule: CustomRule) => validateCustomRule(rule))

  const saveCustomRules = async (rules: CustomRule[]) => {
    for (const rule of rules) validateCustomRule(rule)
    const settings = setSettings({ customRules: rules })
    const path = rebuildActive(settings)
    if (!path) return settings
    const st = await getStatus()
    if (st.running) {
      const profileId = getActiveProfileId()
      if (profileId) {
        await reloadActiveConfig(path, profileId)
      }
    }
    return settings
  }

  ipcMain.handle('customRules:set', (_e, rules: CustomRule[]) => saveCustomRules(rules))
  ipcMain.handle('accessControl:validate', (_e, processName: string, policy: string) =>
    validateProcessNameRule(processName, policy),
  )
  ipcMain.handle('accessControl:set', (_e, rules: AccessControlRule[]) =>
    saveCustomRules(normalizeCustomRules(undefined, rules)),
  )
  ipcMain.handle('dialog:pickProcessPath', async (_e, kind: 'file' | 'directory') => {
    if (kind !== 'file' && kind !== 'directory') throw new Error('invalid path picker kind')
    const result = await dialog.showOpenDialog({
      title: kind === 'file' ? 'Select process executable' : 'Select process directory',
      filters:
        kind === 'file' && process.platform === 'win32'
          ? [
              { name: 'Executable', extensions: ['exe', 'com', 'bat', 'cmd'] },
              { name: 'All', extensions: ['*'] },
            ]
          : undefined,
      properties: [kind === 'file' ? 'openFile' : 'openDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
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
    // Prefer Android-style label (fork@pseudo-version) from sidecar metadata /
    // go.mod — same string baked into libclash via -ldflags on mobile.
    // Do not trust stock mihomo constant.Version ("1.10.0") from the API.
    const labeled = resolveCoreVersionLabel()
    if (labeled.version !== 'unknown') {
      return { version: labeled.version, source: labeled.source }
    }
    try {
      const v = await mihomoApi.getVersion()
      const apiVersion = (v.version || '').trim()
      if (isUsefulCoreLabel(apiVersion)) {
        return { version: apiVersion, source: 'api', meta: v.meta }
      }
      return { version: 'unknown', source: 'none', meta: v.meta }
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
  ipcMain.handle('dashboard:open', async () => {
    const url = await getDashboardUrl()
    try {
      await shell.openExternal(url)
    } catch {
      // openExternal errors can contain the full URL, including the secret.
      throw new Error('Could not open Zashboard in the browser')
    }
  })
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('invalid url')
    }
    void shell.openExternal(url)
  })
  ipcMain.handle(DEEP_LINK_IPC.consumeResult, () => {
    const result = pendingDeepLinkResult
    pendingDeepLinkResult = null
    return result
  })

  ipcMain.handle(PRIVATE_IPC.capabilities, () => getPrivateModule().capabilities())
  ipcMain.handle(PRIVATE_IPC.accountGetSession, () => getPrivateModule().getSession())
  ipcMain.handle(PRIVATE_IPC.accountLogin, async (_e, email: string, password: string) => {
    const session = await getPrivateModule().login(email, password)
    await syncManagedFromPrivate().catch((err) => log(String(err), 'warn'))
    notifyProfilesChanged()
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
  ipcMain.handle(PRIVATE_IPC.subscriptionSync, async () => {
    const info = await syncManagedFromPrivate()
    notifyProfilesChanged()
    return info
  })

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

function startupIdentity(): StartupIdentity {
  const caps = getPrivateModule().capabilities()
  return {
    appId: caps.supportsAuth ? 'com.cheezy.vpn.desktop' : 'com.cheezy.freedom.desktop',
    productName: caps.productName || 'CheezyClash',
  }
}

async function runStartupTasks(caps: PrivateCapabilities): Promise<void> {
  if (caps.supportsAuth) {
    await syncManagedFromPrivate().catch((e) => log(String(e), 'warn'))
  }
  if (!getSettings().autoConnect) return
  if (!getActiveProfileId()) {
    log('auto-connect skipped: no active profile', 'warn')
    return
  }
  await connect().catch((e) => log(`auto-connect failed: ${e}`, 'error'))
}

/** Extract one of our URL schemes from process argv. */
function findDeepLinkInArgv(argv: string[]): string | null {
  for (const arg of argv) {
    if (typeof arg === 'string' && /^(?:cheezy|cheezyvpn|cheezyclash):\/\//i.test(arg)) {
      return arg
    }
  }
  return null
}

function publishDeepLinkResult(result: DeepLinkResultPayload): void {
  const sequenced = { ...result, sequence: ++deepLinkResultSequence } as DeepLinkResult
  pendingDeepLinkResult = sequenced
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(DEEP_LINK_IPC.result, sequenced)
  }
}

function loginErrorKind(error: unknown): 'expired' | 'network' | 'server' {
  const value = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  if (/401|bad_app_login_token/i.test(value)) return 'expired'
  if (/abort|timeout|fetch|network|enotfound|econn/i.test(value)) return 'network'
  return 'server'
}

async function handleDeepLink(raw: string): Promise<void> {
  const capabilities = getPrivateModule().capabilities()
  const action = parseDeepLink(raw, capabilities)
  if (!action) {
    log('deeplink rejected', 'warn')
    return
  }
  log(deepLinkLogLabel(action))

  if (action.kind === 'add') {
    try {
      await importFromUrl(action.subscriptionUrl)
      rescheduleSubscriptionUpdates()
      notifyProfilesChanged()
      revealMainWindow()
      publishDeepLinkResult({ kind: 'add', status: 'success' })
      // Proprietary: if there is no session yet, open the web claim page so the
      // user can register/login and hand back via the proprietary login scheme.
      const mod = getPrivateModule()
      if (typeof mod.claimHandoffUrl === 'function') {
        const handoff = mod.claimHandoffUrl(action.subscriptionUrl)
        if (handoff) {
          await shell.openExternal(handoff)
        }
      }
    } catch (e) {
      log('deeplink add failed', 'warn')
      publishDeepLinkResult({
        kind: 'add',
        status: 'error',
        error: loginErrorKind(e) === 'network' ? 'network' : 'server',
      })
    }
    return
  }

  const mod = getPrivateModule()
  if (typeof mod.exchangeAppLogin !== 'function') {
    log('deeplink login rejected by open build', 'warn')
    return
  }
  try {
    const session = await mod.exchangeAppLogin(action.token)
    revealMainWindow()
    publishDeepLinkResult({
      kind: 'login',
      status: 'success',
      session: {
        email: session.email,
        emailVerified: session.emailVerified,
        tgId: session.tgId,
      },
    })
    void syncManagedFromPrivate()
      .then(() => notifyProfilesChanged())
      .catch(() => log('subscription sync after login failed', 'warn'))
  } catch (e) {
    log('deeplink login failed', 'warn')
    publishDeepLinkResult({
      kind: 'login',
      status: 'error',
      error: loginErrorKind(e),
    })
  }
}

function enqueueOrHandleDeepLink(raw: string): void {
  if (!mainWindow) {
    pendingDeepLink = raw
    return
  }
  void handleDeepLink(raw)
}

function configureProtocolClients(capabilities: PrivateCapabilities): void {
  // Never let `npm run dev` bind a production URL scheme to electron.exe.
  if (process.defaultApp) return

  // Migrate an Open installation that previously owned the shared legacy key.
  if (
    !capabilities.supportsAuth &&
    (process.platform === 'win32' || process.platform === 'darwin') &&
    app.isDefaultProtocolClient('cheezy')
  ) {
    app.removeAsDefaultProtocolClient('cheezy')
  }

  // electron-builder writes macOS plist and Linux x-scheme-handler metadata.
  // Packaged Windows apps must register their executable in the registry.
  if (process.platform !== 'win32') return
  const schemes = [capabilities.deepLinkScheme, ...(capabilities.legacyDeepLinkSchemes ?? [])]
  for (const scheme of schemes) {
    if (!app.setAsDefaultProtocolClient(scheme)) {
      log(`failed to register ${scheme} protocol`, 'warn')
    }
  }
}

// Single-instance handling must run before ready.
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const link = findDeepLinkInArgv(argv)
    if (link) enqueueOrHandleDeepLink(link)
    revealMainWindow()
  })

  // macOS cold-start / open-url while running
  app.on('open-url', (event, url) => {
    event.preventDefault()
    enqueueOrHandleDeepLink(url)
  })

  app.whenReady().then(async () => {
    // Hide File/Edit/View application menu
    Menu.setApplicationMenu(null)

    const priv = loadPrivateModule()
    const caps = priv.capabilities()
    app.setName(caps.productName)
    configureProtocolClients(caps)
    if (process.platform === 'win32') {
      app.setAppUserModelId(
        caps.supportsAuth ? 'com.cheezy.vpn.desktop' : 'com.cheezy.freedom.desktop',
      )
    }

    ensureProfilesRoot()
    migrateOrphanDirs()
    mkdirSilent(coreHome())
    restoreControllerAuth()

    // A crashed UI/core can leave its proxy journal behind. Recover before IPC
    // and auto-connect start; preserve an already-running helper connection.
    try {
      if (process.platform === 'win32' && isSystemProxyOwned() && !(await getStatus()).running) {
        await syncManagedSystemProxy(false)
      }
    } catch (e) {
      log(`system proxy recovery failed: ${e}`, 'warn')
    }

    if (!corePresent()) {
      log('mihomo binary not found — run npm run fetch-core', 'warn')
    }

    const launchHidden = isSystemStartupLaunch(app)
    try {
      applyAutoStart(app, getSettings().autoStart, startupIdentity())
    } catch (e) {
      log(`startup registration sync failed: ${e}`, 'warn')
    }

    registerIpc()
    createWindow(caps.productName, !launchHidden)
    createTray(caps.productName)

    // Cold-start deeplink (Windows/Linux put it on argv; macOS may have queued open-url).
    const coldLink = pendingDeepLink ?? findDeepLinkInArgv(process.argv)
    pendingDeepLink = null
    if (coldLink) void handleDeepLink(coldLink)

    void runStartupTasks(caps)

    startSubscriptionUpdater()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(caps.productName)
      else revealMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    /* keep tray alive on Windows/Linux */
  })

  app.on('before-quit', (e) => {
    if (quitCleanupDone) return
    e.preventDefault()
    if (quitCleanupStarted) return
    quitCleanupStarted = true
    quitting = true
    stopSubscriptionUpdater()
    void disconnect()
      .catch((error) => log(`disconnect during exit failed: ${error}`, 'warn'))
      .then(() => stopHelperOnExit())
      .finally(() => {
        quitCleanupDone = true
        app.quit()
      })
  })
}

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
