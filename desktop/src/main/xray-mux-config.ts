import type { AppSettings } from '../shared/types'

type Mapping = Record<string, unknown>

function mapping(value: unknown): Mapping | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Mapping)
    : null
}

function muxSettings(settings: AppSettings): Mapping {
  if (!settings.xrayMuxEnabled) return { enabled: false }
  const mux: Mapping = {
    enabled: true,
    concurrency: settings.xrayMuxConcurrency,
  }
  if (settings.xrayMuxMaxConnections > 0) {
    mux['max-connections'] = settings.xrayMuxMaxConnections
  }
  return mux
}

/** Apply the global client setting without mutating subscription base.yaml. */
export function applyXrayMuxSettings(doc: Mapping, settings: AppSettings): void {
  const mux = muxSettings(settings)
  if (Array.isArray(doc.proxies)) {
    doc.proxies = doc.proxies.map((raw) => {
      const proxy = mapping(raw)
      if (!proxy) return raw
      const type = typeof proxy.type === 'string' ? proxy.type.trim().toLowerCase() : ''
      const flow = typeof proxy.flow === 'string' ? proxy.flow.trim() : ''
      const network = typeof proxy.network === 'string' ? proxy.network.trim().toLowerCase() : ''
      const rawTcp = network === '' || network === 'tcp'
      if (type === 'vless' && flow === '' && rawTcp) {
        proxy['xray-mux'] = { ...mux }
      }
      return proxy
    })
  }

  const providers = mapping(doc['proxy-providers'])
  if (!providers) return
  for (const [name, raw] of Object.entries(providers)) {
    const provider = mapping(raw)
    if (!provider) continue
    const override = mapping(provider.override) ?? {}
    override['xray-mux'] = { ...mux }
    provider.override = override
    providers[name] = provider
  }
}
