import type { SubscriptionInfo } from '../shared/types'

function looksLikeBase64(value: string): boolean {
  const compact = value.replace(/\s+/g, '')
  if (compact.length < 16 || compact.length % 4 !== 0) return false
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return false
  return true
}

/** Android ConfigYamlParsers.decodeMaybeBase64 + desktop raw-base64 heuristic. */
export function decodeMaybeBase64Header(value: string | null | undefined): string | null {
  if (!value) return null
  const v = value.trim()
  if (!v) return null

  if (v.toLowerCase().startsWith('base64:')) {
    const payload = v.slice(7).trim()
    try {
      return Buffer.from(payload, 'base64').toString('utf8')
    } catch {
      return v
    }
  }

  if (looksLikeBase64(v) && !/[\s]/.test(v) && !v.includes(':')) {
    try {
      const decoded = Buffer.from(v, 'base64').toString('utf8')
      if (decoded && !decoded.includes('\uFFFD') && /[\p{L}\p{N}]/u.test(decoded)) {
        return decoded
      }
    } catch {
      /* keep original */
    }
  }

  return v
}

/** Android ConfigYamlParsers.mergeUserInfo */
export function parseSubscriptionUserInfo(header: string | null): Partial<SubscriptionInfo> {
  if (!header) return {}
  const parts = header
    .split(';')
    .map((s) => {
      const kv = s.trim().split('=', 2)
      if (kv.length !== 2) return null
      return [kv[0]!.trim().toLowerCase(), kv[1]!.trim()] as const
    })
    .filter((x): x is readonly [string, string] => !!x)
  const map = Object.fromEntries(parts)
  return {
    upload: Number.parseInt(map.upload || '0', 10) || 0,
    download: Number.parseInt(map.download || '0', 10) || 0,
    total: Number.parseInt(map.total || '0', 10) || 0,
    expire: Number.parseInt(map.expire || '0', 10) || 0,
  }
}

/** Accept only links that can safely pass through the renderer's openExternal bridge. */
export function parseHttpUrlHeader(value: string | null | undefined): string | undefined {
  const decoded = decodeMaybeBase64Header(value)?.trim()
  if (!decoded) return undefined
  try {
    const url = new URL(decoded)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/** The subscription accent intentionally supports only the documented six-digit hex form. */
export function parseAccentColorHeader(value: string | null | undefined): string | undefined {
  const color = value?.trim()
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : undefined
}

export function subscriptionFromHeaders(headers: Headers): SubscriptionInfo {
  const userInfo = parseSubscriptionUserInfo(headers.get('subscription-userinfo'))
  return {
    title: decodeMaybeBase64Header(headers.get('profile-title')) || undefined,
    announce: decodeMaybeBase64Header(headers.get('announce')) || undefined,
    tag:
      decodeMaybeBase64Header(
        headers.get('subscription-tag') || headers.get('profile-tag'),
      ) || undefined,
    supportUrl: parseHttpUrlHeader(headers.get('support-url')),
    accentColor: parseAccentColorHeader(headers.get('cheezy-accent')),
    upload: userInfo.upload ?? 0,
    download: userInfo.download ?? 0,
    total: userInfo.total ?? 0,
    expire: userInfo.expire ?? 0,
  }
}

/** Safe display name for already-stored profiles that may still be base64. */
export function displayProfileName(name: string): string {
  return decodeMaybeBase64Header(name) || name
}
