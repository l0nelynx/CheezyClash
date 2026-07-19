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
import type {
  PrivateAccountSession,
  PrivateCapabilities,
  PrivateSubscriptionInfo,
} from '../shared/private-api'

export interface CheezyApi {
  getStatus: () => Promise<CoreStatus>
  connect: (mode?: ConnectionMode) => Promise<CoreStatus>
  disconnect: () => Promise<CoreStatus>
  getTraffic: () => Promise<TrafficSnapshot>
  getGroups: () => Promise<ProxyGroupInfo[]>
  selectProxy: (group: string, name: string) => Promise<boolean>
  healthCheck: (group: string) => Promise<Record<string, number>>
  listProfiles: () => Promise<ProfileMeta[]>
  getActiveProfileId: () => Promise<string | null>
  importProfileUrl: (url: string, name?: string) => Promise<ProfileMeta>
  importProfileFile: () => Promise<ProfileMeta | null>
  setActiveProfile: (id: string) => Promise<void>
  deleteProfile: (id: string) => Promise<void>
  getSettings: () => Promise<AppSettings>
  setSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  getTunStatus: () => Promise<TunStatus>
  setTunEnabled: (enabled: boolean) => Promise<TunStatus>
  setConnectionMode: (mode: ConnectionMode) => Promise<TunStatus>
  ensureHelper: () => Promise<TunStatus>
  getLogs: () => Promise<string[]>
  listProcesses: () => Promise<{ name: string; pid: number }[]>
  getProxyGroupNames: () => Promise<string[]>
  validateAccessControlRule: (processName: string, policy: string) => Promise<string>
  setAccessControlRules: (rules: AccessControlRule[]) => Promise<AppSettings>
  pickExecutable: () => Promise<string | null>
  getAppVersion: () => Promise<string>
  getCoreVersion: () => Promise<{ version?: string; meta?: boolean }>
  checkUpdate: () => Promise<{
    current: string
    latest: string | null
    updateAvailable: boolean
    releasesUrl: string
    error?: string
  }>
  openExternal: (url: string) => Promise<void>
  onLog: (cb: (line: string) => void) => () => void
  onStatus: (cb: (status: CoreStatus) => void) => () => void
  windowMinimize: () => Promise<void>
  windowMaximizeToggle: () => Promise<boolean>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>
  onWindowMaximized: (cb: (maximized: boolean) => void) => () => void
  privateCapabilities: () => Promise<PrivateCapabilities>
  privateGetSession: () => Promise<PrivateAccountSession | null>
  privateLogin: (email: string, password: string) => Promise<PrivateAccountSession>
  privateLogout: () => Promise<void>
  privateFetchSubscription: () => Promise<PrivateSubscriptionInfo | null>
  privateSyncSubscription: () => Promise<PrivateSubscriptionInfo | null>
}

declare global {
  interface Window {
    cheezy: CheezyApi
  }
}

export {}
