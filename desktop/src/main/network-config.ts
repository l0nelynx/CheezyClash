import type { AppSettings, ConnectionMode } from '../shared/types'

const DEFAULT_NETWORK_PORT = 7890

const DEFAULT_TUN_CONFIG: Readonly<Record<string, unknown>> = {
  enable: false,
  stack: 'mixed',
  mtu: 1500,
  'auto-route': true,
  'auto-detect-interface': true,
  'strict-route': true,
  'dns-hijack': ['any:53', 'tcp://any:53'],
}

export interface EffectiveNetworkConfig {
  mode: ConnectionMode
  mixedPort: number
  allowLan: boolean
  bindAddress: string
  tunStack: AppSettings['tunStack']
  tunMtu: number
  overrideEnabled: boolean
}

function hasOwn(doc: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(doc, key)
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function cloneDefault(value: unknown): unknown {
  return Array.isArray(value) ? [...value] : value
}

function applyDesktopOverrides(doc: Record<string, unknown>, settings: AppSettings): void {
  doc['mixed-port'] = settings.mixedPort
  doc['allow-lan'] = settings.allowLan
  doc['bind-address'] = settings.allowLan ? '*' : '127.0.0.1'
  doc.tun = {
    enable: settings.connectionMode === 'tun' || settings.tunEnabled,
    stack: settings.tunStack,
    mtu: settings.tunMtu,
    'auto-route': true,
    'auto-detect-interface': true,
    'strict-route': true,
    'dns-hijack': ['any:53', 'tcp://any:53'],
  }
}

function applyProfileDefaults(doc: Record<string, unknown>): void {
  if (!hasOwn(doc, 'mixed-port')) doc['mixed-port'] = DEFAULT_NETWORK_PORT
  if (!hasOwn(doc, 'allow-lan')) doc['allow-lan'] = false
  if (!hasOwn(doc, 'bind-address')) {
    doc['bind-address'] = doc['allow-lan'] === true ? '*' : '127.0.0.1'
  }

  const configuredTun = doc.tun
  if (configuredTun != null && !isMapping(configuredTun)) {
    throw new Error('Invalid YAML: tun must be a mapping, null, or omitted')
  }
  const tun: Record<string, unknown> = configuredTun == null ? {} : configuredTun
  for (const [key, value] of Object.entries(DEFAULT_TUN_CONFIG)) {
    if (!hasOwn(tun, key)) tun[key] = cloneDefault(value)
  }
  doc.tun = tun
}

export function effectiveNetworkFromDocument(
  doc: Record<string, unknown>,
  overrideEnabled: boolean,
): EffectiveNetworkConfig {
  const tun = isMapping(doc.tun) ? doc.tun : {}
  const stack = tun.stack
  const mtu = tun.mtu
  return {
    mode: tun.enable === true ? 'tun' : 'proxy',
    mixedPort:
      typeof doc['mixed-port'] === 'number' ? doc['mixed-port'] : DEFAULT_NETWORK_PORT,
    allowLan: doc['allow-lan'] === true,
    bindAddress:
      typeof doc['bind-address'] === 'string' ? doc['bind-address'] : '127.0.0.1',
    tunStack:
      stack === 'system' || stack === 'gvisor' || stack === 'mixed' ? stack : 'mixed',
    tunMtu: typeof mtu === 'number' ? mtu : 1500,
    overrideEnabled,
  }
}

/** Apply Desktop overrides or fill only missing YAML network fields. */
export function applyNetworkSettings(
  doc: Record<string, unknown>,
  settings: AppSettings,
): EffectiveNetworkConfig {
  if (settings.networkOverrideEnabled) {
    applyDesktopOverrides(doc, settings)
  } else {
    applyProfileDefaults(doc)
  }
  return effectiveNetworkFromDocument(doc, settings.networkOverrideEnabled)
}
