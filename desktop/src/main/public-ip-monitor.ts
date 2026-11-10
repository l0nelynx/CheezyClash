import { isIP } from 'node:net'
import type { PublicIpSnapshot } from '../shared/types'

export const PUBLIC_IP_COOLDOWN_MS = 60_000
export const PUBLIC_IP_PROVIDERS = [
  { name: 'ipquery.io', url: 'https://api.ipquery.io/?format=json' },
  { name: 'ipinfo.io', url: 'https://ipinfo.io/json' },
  { name: 'seeip.org', url: 'https://api.seeip.org/geoip' },
  { name: 'ident.me', url: 'https://ident.me/json' },
  { name: 'ip-api.com', url: 'http://ip-api.com/json/?fields=status,query,countryCode' },
] as const

export function parsePublicIp(value: unknown): Pick<PublicIpSnapshot, 'ip' | 'countryCode'> {
  if (!value || typeof value !== 'object') throw new Error('Invalid IP response')
  const data = value as Record<string, unknown>
  if (data.status === 'fail' || data.error) throw new Error('IP lookup failed')
  const ip = typeof data.ip === 'string' ? data.ip.trim() : typeof data.query === 'string' ? data.query.trim() : ''
  if (!isIP(ip)) throw new Error('Invalid IP address')
  const location = data.location as Record<string, unknown> | undefined
  const country = location?.country_code ?? data.country_code ?? data.countryCode ?? data.cc ?? data.country
  const countryCode = typeof country === 'string' && /^[a-z]{2}$/i.test(country) ? country.toUpperCase() : undefined
  return { ip, countryCode }
}

/** One process-wide budget: reconnects, route changes and failures never reset it. */
export class PublicIpMonitor {
  private route: string | null = null
  private generation = 0
  private nextAttemptAt = 0
  private providerIndex = 0
  private controller: AbortController | null = null
  private inFlight = false
  private result: PublicIpSnapshot | null = null
  private readonly request: (url: string, signal: AbortSignal) => Promise<Response>
  private readonly now: () => number

  constructor(
    request: (url: string, signal: AbortSignal) => Promise<Response>,
    now: () => number = Date.now,
  ) { this.request = request; this.now = now }

  setRoute(route: string | null): void {
    if (this.route === route) return
    this.route = route
    this.generation++
    this.result = null
    this.controller?.abort()
  }

  snapshot(): PublicIpSnapshot {
    if (!this.route) return { state: 'disconnected' }
    if (this.result) return { ...this.result }
    if (!this.inFlight && this.now() >= this.nextAttemptAt) void this.lookup()
    return { state: 'pending', retryAt: this.nextAttemptAt }
  }

  private async lookup(): Promise<void> {
    this.inFlight = true
    this.nextAttemptAt = this.now() + PUBLIC_IP_COOLDOWN_MS
    const generation = this.generation
    const provider = PUBLIC_IP_PROVIDERS[this.providerIndex]
    const controller = new AbortController()
    this.controller = controller
    const timeout = setTimeout(() => controller.abort(), 8_000)
    try {
      const response = await this.request(provider.url, controller.signal)
      // Respect server backoff even if a route changed while the request was in flight.
      const retry = response.headers.get('retry-after')
      const retryMs = retry === null ? 0 : /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - this.now()
      const ttl = response.headers.get('x-rl') === '0' ? Number(response.headers.get('x-ttl')) * 1000 : 0
      const backoff = Math.max(Number.isFinite(retryMs) ? retryMs : 0, Number.isFinite(ttl) ? ttl : 0)
      this.nextAttemptAt = Math.max(this.nextAttemptAt, this.now() + backoff)
      if (!response.ok) throw new Error('IP provider unavailable')
      const value = parsePublicIp(await response.json())
      if (generation === this.generation && !controller.signal.aborted) {
        this.result = { state: 'ready', ...value, provider: provider.name }
      }
    } catch {
      if (generation === this.generation) this.providerIndex = (this.providerIndex + 1) % PUBLIC_IP_PROVIDERS.length
    } finally {
      clearTimeout(timeout)
      this.controller = null
      this.inFlight = false
    }
  }
}
