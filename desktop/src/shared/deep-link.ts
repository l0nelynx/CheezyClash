import type { PrivateCapabilities } from './private-api'

export const DEEP_LINK_IPC = {
  consumeResult: 'deeplink:consumeResult',
  result: 'deeplink:result',
} as const

export type DeepLinkAction =
  | { kind: 'add'; subscriptionUrl: string }
  | { kind: 'login'; token: string }

export type DeepLinkResultPayload =
  | {
      kind: 'login'
      status: 'success'
      session?: { email?: string; emailVerified?: boolean; tgId?: number }
    }
  | {
      kind: 'login'
      status: 'error'
      error: 'expired' | 'network' | 'server'
    }
  | { kind: 'add'; status: 'success' }
  | {
      kind: 'add'
      status: 'error'
      error: 'invalid' | 'network' | 'server'
    }

export type DeepLinkResult = DeepLinkResultPayload & { sequence: number }

function percentDecode(value: string): string {
  if (!value.includes('%')) return value
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function parseDeepLink(
  raw: string,
  capabilities: PrivateCapabilities,
): DeepLinkAction | null {
  const value = raw.trim()
  const marker = value.indexOf('://')
  if (marker <= 0) return null

  const scheme = value.slice(0, marker).toLowerCase()
  const rest = value.slice(marker + 3)
  const slash = rest.indexOf('/')
  const action = (slash >= 0 ? rest.slice(0, slash) : rest).toLowerCase()
  const payload = slash >= 0 ? percentDecode(rest.slice(slash + 1)).trim() : ''

  const allowedSchemes = [
    capabilities.deepLinkScheme,
    ...(capabilities.legacyDeepLinkSchemes ?? []),
  ].map((item) => item.toLowerCase())
  if (!allowedSchemes.includes(scheme) || !payload) return null

  if (action === 'add') {
    return payload.toLowerCase().startsWith('https://')
      ? { kind: 'add', subscriptionUrl: payload }
      : null
  }
  if (
    action === 'login' &&
    capabilities.supportsAuth &&
    /^[A-Za-z0-9_-]{10,128}$/.test(payload)
  ) {
    return { kind: 'login', token: payload }
  }
  return null
}

export function deepLinkLogLabel(action: DeepLinkAction): string {
  return `deeplink ${action.kind}`
}
