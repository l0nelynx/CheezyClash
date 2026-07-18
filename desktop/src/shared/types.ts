export type ConnectionMode = 'proxy' | 'tun'

export interface AppSettings {
  systemProxy: boolean
  mixedPort: number
  allowLan: boolean
  tunEnabled: boolean
  tunStack: 'system' | 'gvisor' | 'mixed'
  autoStart: boolean
}

export interface ProfileMeta {
  id: string
  name: string
  url?: string
  updatedAt: number
  createdAt: number
  subscription?: SubscriptionInfo
}

export interface SubscriptionInfo {
  title?: string
  announce?: string
  tag?: string
  upload: number
  download: number
  total: number
  /** Unix seconds; 0 = unknown */
  expire: number
}

export interface TrafficSnapshot {
  up: number
  down: number
  upTotal: number
  downTotal: number
}

export interface ProxyGroupInfo {
  name: string
  type: string
  now: string
  all: string[]
}

export interface CoreStatus {
  running: boolean
  mode: ConnectionMode
  pid?: number
  controller: string
  secret: string
  lastError?: string
  helperReady: boolean
  privilegesOk: boolean
}

export interface TunStatus {
  enabled: boolean
  helperInstalled: boolean
  helperRunning: boolean
  privilegesOk: boolean
  lastError?: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  systemProxy: true,
  mixedPort: 7890,
  allowLan: false,
  tunEnabled: false,
  tunStack: 'mixed',
  autoStart: false,
}

export const HELPER_PORT = 47991
export const HELPER_IDENTITY = 'CheezyHelper/1'
export const CONTROLLER_HOST = '127.0.0.1'
export const CONTROLLER_PORT = 9090
