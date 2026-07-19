import { ipcRenderer, contextBridge } from 'electron'
import type {
  AccessControlRule,
  AppSettings,
  ConnectionMode,
  CoreStatus,
  ProfileMeta,
  ProxyGroupInfo,
  TrafficSnapshot,
  TunStatus,
} from '../shared/types'
import {
  PRIVATE_IPC,
  type PrivateAccountSession,
  type PrivateCapabilities,
  type PrivateSubscriptionInfo,
} from '../shared/private-api'

const api = {
  getStatus: (): Promise<CoreStatus> => ipcRenderer.invoke('core:status'),
  connect: (mode?: ConnectionMode): Promise<CoreStatus> =>
    ipcRenderer.invoke('core:connect', mode),
  disconnect: (): Promise<CoreStatus> => ipcRenderer.invoke('core:disconnect'),
  getTraffic: (): Promise<TrafficSnapshot> => ipcRenderer.invoke('core:traffic'),
  getGroups: (): Promise<ProxyGroupInfo[]> => ipcRenderer.invoke('proxies:groups'),
  selectProxy: (group: string, name: string): Promise<boolean> =>
    ipcRenderer.invoke('proxies:select', group, name),
  healthCheck: (group: string): Promise<Record<string, number>> =>
    ipcRenderer.invoke('proxies:health', group),
  listProfiles: (): Promise<ProfileMeta[]> => ipcRenderer.invoke('profiles:list'),
  getActiveProfileId: (): Promise<string | null> =>
    ipcRenderer.invoke('profiles:active'),
  importProfileUrl: (url: string, name?: string): Promise<ProfileMeta> =>
    ipcRenderer.invoke('profiles:importUrl', url, name),
  importProfileFile: (): Promise<ProfileMeta | null> =>
    ipcRenderer.invoke('profiles:importFile'),
  setActiveProfile: (id: string): Promise<void> =>
    ipcRenderer.invoke('profiles:setActive', id),
  updateProfile: (id: string): Promise<ProfileMeta> =>
    ipcRenderer.invoke('profiles:update', id),
  deleteProfile: (id: string): Promise<void> =>
    ipcRenderer.invoke('profiles:delete', id),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:set', patch),
  getTunStatus: (): Promise<TunStatus> => ipcRenderer.invoke('tun:status'),
  setTunEnabled: (enabled: boolean): Promise<TunStatus> =>
    ipcRenderer.invoke('tun:setEnabled', enabled),
  setConnectionMode: (mode: ConnectionMode): Promise<TunStatus> =>
    ipcRenderer.invoke('connection:setMode', mode),
  ensureHelper: (): Promise<TunStatus> => ipcRenderer.invoke('helper:ensure'),
  getLogs: (): Promise<string[]> => ipcRenderer.invoke('logs:get'),
  listProcesses: (): Promise<{ name: string; pid: number }[]> =>
    ipcRenderer.invoke('processes:list'),
  getProxyGroupNames: (): Promise<string[]> =>
    ipcRenderer.invoke('profiles:proxyGroupNames'),
  validateAccessControlRule: (processName: string, policy: string): Promise<string> =>
    ipcRenderer.invoke('accessControl:validate', processName, policy),
  setAccessControlRules: (rules: AccessControlRule[]): Promise<AppSettings> =>
    ipcRenderer.invoke('accessControl:set', rules),
  pickExecutable: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pickExecutable'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  getCoreVersion: (): Promise<{ version?: string; meta?: boolean }> =>
    ipcRenderer.invoke('core:version'),
  checkUpdate: (): Promise<{
    current: string
    latest: string | null
    updateAvailable: boolean
    releasesUrl: string
    error?: string
  }> => ipcRenderer.invoke('app:checkUpdate'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  onLog: (cb: (line: string) => void): (() => void) => {
    const handler = (_: unknown, line: string): void => cb(line)
    ipcRenderer.on('logs:line', handler)
    return () => ipcRenderer.removeListener('logs:line', handler)
  },
  onStatus: (cb: (status: CoreStatus) => void): (() => void) => {
    const handler = (_: unknown, status: CoreStatus): void => cb(status)
    ipcRenderer.on('core:statusChanged', handler)
    return () => ipcRenderer.removeListener('core:statusChanged', handler)
  },
  onProfilesChanged: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('profiles:changed', handler)
    return () => ipcRenderer.removeListener('profiles:changed', handler)
  },
  windowMinimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  windowMaximizeToggle: (): Promise<boolean> =>
    ipcRenderer.invoke('window:maximizeToggle'),
  windowClose: (): Promise<void> => ipcRenderer.invoke('window:close'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  onWindowMaximized: (cb: (maximized: boolean) => void): (() => void) => {
    const handler = (_: unknown, maximized: boolean): void => cb(maximized)
    ipcRenderer.on('window:maximized', handler)
    return () => ipcRenderer.removeListener('window:maximized', handler)
  },

  privateCapabilities: (): Promise<PrivateCapabilities> =>
    ipcRenderer.invoke(PRIVATE_IPC.capabilities),
  privateGetSession: (): Promise<PrivateAccountSession | null> =>
    ipcRenderer.invoke(PRIVATE_IPC.accountGetSession),
  privateLogin: (email: string, password: string): Promise<PrivateAccountSession> =>
    ipcRenderer.invoke(PRIVATE_IPC.accountLogin, email, password),
  privateLogout: (): Promise<void> => ipcRenderer.invoke(PRIVATE_IPC.accountLogout),
  privateFetchSubscription: (): Promise<PrivateSubscriptionInfo | null> =>
    ipcRenderer.invoke(PRIVATE_IPC.subscriptionFetch),
  privateSyncSubscription: (): Promise<PrivateSubscriptionInfo | null> =>
    ipcRenderer.invoke(PRIVATE_IPC.subscriptionSync),
}

contextBridge.exposeInMainWorld('cheezy', api)

export type CheezyApi = typeof api
