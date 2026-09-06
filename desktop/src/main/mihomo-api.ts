import { TrafficStream } from './traffic-stream'
import { CONTROLLER_HOST, CONTROLLER_PORT } from '../shared/types'
import type { ProxyGroupInfo, TrafficSnapshot } from '../shared/types'
import { readFileSync } from 'fs'
import { log } from './logger'
import { readControllerConfig } from './controller-config'

type DelayHistory = { time?: string; delay?: number }

type MihomoProxy = {
  type: string
  now?: string
  all?: string[]
  hidden?: boolean
  testUrl?: string
  history?: DelayHistory[]
  extra?: Record<string, { history?: DelayHistory[]; alive?: boolean }>
}

/** Last delay from core history (ms). `0` → `-1` (fail); empty → undefined. */
function lastDelayMs(proxy: MihomoProxy | undefined, testUrl?: string): number | undefined {
  if (!proxy) return undefined
  const fromExtra =
    testUrl && proxy.extra?.[testUrl]?.history?.length
      ? proxy.extra[testUrl]!.history
      : undefined
  const hist = fromExtra || proxy.history
  if (!hist || hist.length === 0) return undefined
  const delay = hist[hist.length - 1]?.delay
  if (typeof delay !== 'number') return undefined
  return delay > 0 ? delay : -1
}

export class MihomoApi {
  private groupsInFlight: Promise<ProxyGroupInfo[]> | null = null

  constructor(
    private host = CONTROLLER_HOST,
    private port = CONTROLLER_PORT,
    private secret = '',
  ) {}

  setAuth(host: string, port: number, secret: string): void {
    this.host = host
    this.port = port
    this.secret = secret
    this.groupsInFlight = null
    this.stopTraffic()
  }

  getSecret(): string {
    return this.secret
  }

  private url(path: string): string {
    return `http://${this.host}:${this.port}${path}`
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.secret) h.Authorization = `Bearer ${this.secret}`
    return h
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs = 8_000,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: this.headers(),
      signal: AbortSignal.timeout(timeoutMs),
    }
    if (body !== undefined) init.body = JSON.stringify(body)
    const res = await fetch(this.url(path), init)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`${method} ${path} → ${res.status} ${text}`)
    }
    if (res.status === 204) return undefined as T
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) return (await res.json()) as T
    return (await res.text()) as T
  }

  async ping(): Promise<boolean> {
    try {
      await this.request('GET', '/version')
      return true
    } catch {
      return false
    }
  }

  async getVersion(): Promise<{ version?: string; meta?: boolean }> {
    return this.request('GET', '/version')
  }

  async waitReady(timeoutMs = 15_000): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (await this.ping()) return
      await new Promise((r) => setTimeout(r, 200))
    }
    throw new Error('mihomo controller not ready')
  }

  async putConfigs(configPath: string): Promise<void> {
    // Prefer payload over path: mihomo only allows path reloads under SAFE_PATHS
    // (-d home). Our config.yaml lives in profiles/<id>/, outside that allowlist.
    const payload = readFileSync(configPath, 'utf8')
    // Mihomo's PUT /configs does not recreate the controller. Never switch the
    // client to new credentials while the server is still using the old ones.
    if (readControllerConfig(payload).secret !== this.secret) {
      throw new Error('Changing the controller secret requires a core restart')
    }
    await this.request('PUT', '/configs?force=true', { payload })
  }

  async patchConfigs(patch: Record<string, unknown>): Promise<void> {
    await this.request('PATCH', '/configs', patch)
  }

  /** Close all live connections so new proxy/rules take effect immediately. */
  async closeAllConnections(): Promise<void> {
    try {
      await this.request('DELETE', '/connections')
    } catch (e) {
      log(`closeAllConnections failed: ${e}`, 'warn')
    }
  }

  async getProxies(): Promise<Record<string, MihomoProxy>> {
    const data = await this.request<{ proxies: Record<string, MihomoProxy> }>('GET', '/proxies')
    return data.proxies || {}
  }

  async getGroups(): Promise<ProxyGroupInfo[]> {
    if (this.groupsInFlight) return this.groupsInFlight
    const pending = this.loadGroups().finally(() => {
      if (this.groupsInFlight === pending) this.groupsInFlight = null
    })
    this.groupsInFlight = pending
    return pending
  }

  private async loadGroups(): Promise<ProxyGroupInfo[]> {
    const proxies = await this.getProxies()
    const isGroup = (p: { type?: string; all?: string[] }): boolean => {
      if (!p.all || p.all.length === 0) return false
      const t = (p.type || '').toLowerCase()
      return (
        t.includes('selector') ||
        t.includes('urltest') ||
        t.includes('fallback') ||
        t.includes('loadbalance') ||
        t.includes('load-balance') ||
        t.includes('relay') ||
        t.includes('compatible')
      )
    }

    const toInfo = (name: string): ProxyGroupInfo | null => {
      const p = proxies[name]
      if (!p || !isGroup(p) || p.hidden === true) return null
      const all = p.all || []
      const delays: Record<string, number> = {}
      for (const member of all) {
        const d = lastDelayMs(proxies[member], p.testUrl)
        if (d !== undefined) delays[member] = d
      }
      return {
        name,
        type: p.type,
        now: p.now || '',
        all,
        delays: Object.keys(delays).length > 0 ? delays : undefined,
      }
    }

    // Authoritative order = GLOBAL.all (same idea as Android QueryProxyGroupNames).
    const globalAll = proxies.GLOBAL?.all
    if (globalAll && globalAll.length > 0) {
      const groups: ProxyGroupInfo[] = []
      const seen = new Set<string>()
      for (const name of globalAll) {
        if (seen.has(name)) continue
        const info = toInfo(name)
        if (!info) continue
        seen.add(name)
        groups.push(info)
      }
      return groups
    }

    // Fallback if GLOBAL missing: preserve Object.entries order, no alpha sort.
    const groups: ProxyGroupInfo[] = []
    for (const name of Object.keys(proxies)) {
      const info = toInfo(name)
      if (info) groups.push(info)
    }
    return groups
  }

  async selectProxy(group: string, name: string): Promise<boolean> {
    await this.request('PUT', `/proxies/${encodeURIComponent(group)}`, { name })
    return true
  }

  /** Re-apply stored selector choices after a full config reload. */
  async applySelections(selections: Record<string, string>): Promise<void> {
    const entries = Object.entries(selections)
    if (entries.length === 0) return
    for (const [group, name] of entries) {
      try {
        await this.request('PUT', `/proxies/${encodeURIComponent(group)}`, { name })
      } catch (e) {
        log(`applySelections ${group}→${name} failed: ${e}`, 'warn')
      }
    }
  }

  async healthCheck(group: string): Promise<Record<string, number>> {
    const data = await this.request<Record<string, number>>(
      'GET',
      `/group/${encodeURIComponent(group)}/delay?timeout=5000&url=${encodeURIComponent('https://www.gstatic.com/generate_204')}`,
      undefined,
      30_000,
    )
    const out: Record<string, number> = {}
    for (const [name, delay] of Object.entries(data || {})) {
      out[name] = delay > 0 ? delay : -1
    }
    return out
  }

  private trafficStream = new TrafficStream(signal => fetch(this.url('/traffic'), { headers: this.headers(), signal }))

  stopTraffic(): void { this.trafficStream.stop() }

  async getTraffic(): Promise<TrafficSnapshot> { return this.trafficStream.sample() }
}

export const mihomoApi = new MihomoApi()
