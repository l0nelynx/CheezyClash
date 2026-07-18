import { CONTROLLER_HOST, CONTROLLER_PORT } from '../shared/types'
import type { ProxyGroupInfo, TrafficSnapshot } from '../shared/types'
import { log } from './logger'
import { getOrCreateSecret } from './store'

export class MihomoApi {
  constructor(
    private host = CONTROLLER_HOST,
    private port = CONTROLLER_PORT,
    private secret = '',
  ) {}

  setAuth(host: string, port: number, secret: string): void {
    this.host = host
    this.port = port
    this.secret = secret
  }

  /** Ensure controller secret matches the one written into config.yaml. */
  ensureSecretFromStore(): void {
    const secret = getOrCreateSecret()
    this.setAuth(CONTROLLER_HOST, CONTROLLER_PORT, secret)
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
    this.ensureSecretFromStore()
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

  async putConfigs(path: string): Promise<void> {
    // force reload config from path
    await this.request('PUT', '/configs?force=true', { path })
  }

  async patchConfigs(patch: Record<string, unknown>): Promise<void> {
    await this.request('PATCH', '/configs', patch)
  }

  async getProxies(): Promise<
    Record<string, { type: string; now?: string; all?: string[]; hidden?: boolean }>
  > {
    this.ensureSecretFromStore()
    const data = await this.request<{
      proxies: Record<
        string,
        { type: string; now?: string; all?: string[]; hidden?: boolean }
      >
    }>('GET', '/proxies')
    return data.proxies || {}
  }

  async getGroups(): Promise<ProxyGroupInfo[]> {
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
      return {
        name,
        type: p.type,
        now: p.now || '',
        all: p.all || [],
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
    try {
      await this.request('PUT', `/proxies/${encodeURIComponent(group)}`, { name })
      return true
    } catch (e) {
      log(`selectProxy failed: ${e}`, 'warn')
      return false
    }
  }

  async healthCheck(group: string): Promise<Record<string, number>> {
    const data = await this.request<Record<string, number>>(
      'GET',
      `/group/${encodeURIComponent(group)}/delay?timeout=5000&url=${encodeURIComponent('https://www.gstatic.com/generate_204')}`,
      undefined,
      30_000,
    )
    return data || {}
  }

  async getTraffic(): Promise<TrafficSnapshot> {
    // Do NOT call GET /traffic — in mihomo it is an infinite SSE stream and
    // fetch() never resolves (freezes UI busy-state / empty Proxies tab).
    try {
      const c = await this.request<{ downloadTotal?: number; uploadTotal?: number }>(
        'GET',
        '/connections',
      )
      return {
        up: 0,
        down: 0,
        upTotal: c.uploadTotal || 0,
        downTotal: c.downloadTotal || 0,
      }
    } catch {
      return { up: 0, down: 0, upTotal: 0, downTotal: 0 }
    }
  }
}

export const mihomoApi = new MihomoApi()
