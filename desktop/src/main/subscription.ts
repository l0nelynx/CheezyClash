/**
 * Mirrors Android ConfigManager.openSubscriptionConnection UA format:
 * `$appName/${EDITION}/mihomo/${VERSION_NAME}`
 */
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { platform, release, arch } from 'os'
import { store } from './store'
import { getPrivateModule } from './private-module'
import {
  decodeMaybeBase64Header,
  displayProfileName,
  subscriptionFromHeaders,
} from './subscription-metadata'

export {
  decodeMaybeBase64Header,
  displayProfileName,
  parseAccentColorHeader,
  parseHttpUrlHeader,
  parseSubscriptionUserInfo,
  subscriptionFromHeaders,
} from './subscription-metadata'

export function subscriptionUserAgent(): string {
  const caps = getPrivateModule().capabilities()
  const productName = caps.productName || 'CheezyClash'
  const edition = caps.supportsAuth ? 'PROPRIETARY' : 'OPEN'
  const ver = app.getVersion() || '0.0.0'
  return `${productName}/${edition}/mihomo/${ver}`
}

export function getOrCreateHwid(): string {
  const existing = store.get('desktopHwid')
  if (existing) return existing
  const id = randomUUID()
  store.set('desktopHwid', id)
  return id
}

export function subscriptionHeaders(): Record<string, string> {
  const osName =
    platform() === 'win32' ? 'Windows' : platform() === 'darwin' ? 'macOS' : 'Linux'
  return {
    Accept: 'text/yaml, text/plain, application/octet-stream, */*',
    'User-Agent': subscriptionUserAgent(),
    'x-hwid': getOrCreateHwid(),
    'x-device-os': osName,
    'x-ver-os': release(),
    'x-device-model': `${osName}-${arch()}`,
  }
}

/**
 * Panels often return Clash YAML, sometimes base64(YAML), or (on UA reject)
 * base64(share-link list). Normalize to Clash YAML text or throw.
 */
export function normalizeSubscriptionBody(raw: string): string {
  let text = raw.replace(/^\uFEFF/, '').trim()
  if (!text) throw new Error('Empty subscription body')

  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim()
  }

  if (looksLikeClashYaml(text)) return text

  if (looksLikeBase64(text)) {
    const decoded = Buffer.from(text.replace(/\s+/g, ''), 'base64').toString('utf8').trim()
    if (looksLikeClashYaml(decoded)) return decoded
    if (/^(vless|vmess|ss|trojan|hysteria|tuic):\/\//im.test(decoded)) {
      throw new Error(
        'Subscription returned share-links instead of Clash YAML — the panel rejected this client (check User-Agent). ' +
          `UA used: ${subscriptionUserAgent()}`,
      )
    }
    throw new Error(
      'Subscription body is base64 but not Clash YAML after decode. ' +
        `UA used: ${subscriptionUserAgent()}`,
    )
  }

  if (/^(vless|vmess|ss|trojan):\/\//im.test(text)) {
    throw new Error(
      'Subscription returned share-links, not Clash YAML. Use a Clash/Mihomo subscription URL.',
    )
  }

  return text
}

function looksLikeClashYaml(text: string): boolean {
  if (/^(proxies|proxy-groups|rules|mixed-port|port|socks-port|dns|tun)\s*:/m.test(text)) {
    return true
  }
  if (text.startsWith('---') && /:\s/m.test(text)) return true
  return false
}

function looksLikeBase64(text: string): boolean {
  const compact = text.replace(/\s+/g, '')
  if (compact.length < 16 || compact.length % 4 !== 0) return false
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return false
  return !looksLikeClashYaml(text)
}

/** Android ConfigYamlParsers.parseFilename */
export function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header)
  const name = match?.[1]?.trim()
  return name || null
}

/** Android ConfigManager: profile-update-interval as hours; invalid/absent → 0. */
export function parseUpdateIntervalHours(headers: Headers): number {
  const raw = headers.get('profile-update-interval')
  if (!raw) return 0
  const n = Number.parseInt(raw.trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}
