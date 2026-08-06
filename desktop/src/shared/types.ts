export type ConnectionMode = 'proxy' | 'tun'

export interface AccessControlRule {
  id: string
  processName: string
  /** Clash policy: DIRECT | PROXY | REJECT | proxy-group name */
  policy: string
}

export interface AppSettings {
  systemProxy: boolean
  mixedPort: number
  allowLan: boolean
  /** @deprecated migrated to connectionMode; kept for YAML tun.enable sync */
  tunEnabled: boolean
  connectionMode: ConnectionMode
  tunStack: 'system' | 'gvisor' | 'mixed'
  /** Override profile YAML network and TUN settings with Desktop values. */
  networkOverrideEnabled: boolean
  /** TUN interface MTU used when Desktop network override is enabled. */
  tunMtu: number
  autoStart: boolean
  xrayMuxEnabled: boolean
  xrayMuxConcurrency: number
  /** 0 means omitted from generated YAML / unlimited. */
  xrayMuxMaxConnections: number
  accessControlRules: AccessControlRule[]
}

export interface ProfileMeta {
  id: string
  name: string
  url?: string
  updatedAt: number
  createdAt: number
  subscription?: SubscriptionInfo
  /** From profile-update-interval header (hours). 0 / omit = no auto-update. */
  updateIntervalHours?: number
  /** Stable account-managed identity. Omitted for manual/imported profiles. */
  managedKey?: string
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
  /** Optional group icon URL from YAML `icon:` (https only). */
  icon?: string
  /**
   * Last known delays from core proxy history (ms).
   * `-1` = last check failed; omit = never tested.
   */
  delays?: Record<string, number>
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
  connectionMode: 'proxy',
  tunStack: 'mixed',
  networkOverrideEnabled: false,
  tunMtu: 1500,
  autoStart: false,
  xrayMuxEnabled: true,
  xrayMuxConcurrency: 32,
  xrayMuxMaxConnections: 0,
  accessControlRules: [],
}

/** Normalize persisted settings and migrate legacy tunEnabled values. */
export function normalizeSettings(raw: Partial<AppSettings>): AppSettings {
  const merged: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    accessControlRules: Array.isArray(raw.accessControlRules)
      ? raw.accessControlRules
      : DEFAULT_SETTINGS.accessControlRules,
  }

  if (raw.connectionMode === 'proxy' || raw.connectionMode === 'tun') {
    merged.connectionMode = raw.connectionMode
  } else if (typeof raw.tunEnabled === 'boolean') {
    merged.connectionMode = raw.tunEnabled ? 'tun' : 'proxy'
  }

  merged.tunEnabled = merged.connectionMode === 'tun'
  merged.networkOverrideEnabled = raw.networkOverrideEnabled === true
  merged.tunMtu =
    typeof raw.tunMtu === 'number' &&
    Number.isInteger(raw.tunMtu) &&
    raw.tunMtu >= 576 &&
    raw.tunMtu <= 9000
      ? raw.tunMtu
      : DEFAULT_SETTINGS.tunMtu
  merged.xrayMuxEnabled =
    typeof raw.xrayMuxEnabled === 'boolean'
      ? raw.xrayMuxEnabled
      : DEFAULT_SETTINGS.xrayMuxEnabled
  merged.xrayMuxConcurrency =
    typeof raw.xrayMuxConcurrency === 'number' &&
    Number.isInteger(raw.xrayMuxConcurrency) &&
    raw.xrayMuxConcurrency >= 1
      ? raw.xrayMuxConcurrency
      : DEFAULT_SETTINGS.xrayMuxConcurrency
  merged.xrayMuxMaxConnections =
    typeof raw.xrayMuxMaxConnections === 'number' &&
    Number.isInteger(raw.xrayMuxMaxConnections) &&
    raw.xrayMuxMaxConnections >= 0
      ? raw.xrayMuxMaxConnections
      : DEFAULT_SETTINGS.xrayMuxMaxConnections
  return merged
}

export const HELPER_PORT = 47991
export const HELPER_IDENTITY = 'CheezyHelper/1'
export const CONTROLLER_HOST = '127.0.0.1'
export const CONTROLLER_PORT = 9090

/** UI label BLOCK → Clash REJECT */
export function policyToClash(policy: string): string {
  if (policy === 'BLOCK') return 'REJECT'
  return policy
}

export function clashToPolicyLabel(policy: string): string {
  if (policy === 'REJECT') return 'BLOCK'
  return policy
}
