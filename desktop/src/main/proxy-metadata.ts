import type { ProxyNodeInfo } from '../shared/types'

const tcpTypes = new Set(['ss', 'shadowsocks', 'ssr', 'shadowsocksr', 'vmess', 'vless', 'trojan', 'http', 'socks5', 'anytls', 'ssh'])
const udpTypes = new Set(['wireguard', 'hysteria', 'hysteria2', 'tuic'])

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Copy only presentation fields; never send server addresses or credentials to the UI. */
export function proxyNodeInfo(value: unknown): ProxyNodeInfo {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const proxy = value as Record<string, unknown>
  const type = string(proxy.type)
  const transport = type?.toLowerCase()
  const network = string(proxy.network) ?? (transport && udpTypes.has(transport) ? 'udp' : transport && tcpTypes.has(transport) ? 'tcp' : undefined)
  const serverDescription = string(proxy.serverDescription)
  return {
    ...(type ? { type } : {}),
    ...(network ? { network } : {}),
    ...(serverDescription ? { serverDescription } : {}),
  }
}

export function proxyMetadataFromDocument(doc: Record<string, unknown>): Record<string, ProxyNodeInfo> {
  const metadata: Record<string, ProxyNodeInfo> = Object.create(null)
  const add = (proxies: unknown): void => {
    if (!Array.isArray(proxies)) return
    for (const proxy of proxies) {
      if (!proxy || typeof proxy !== 'object' || Array.isArray(proxy)) continue
      const name = string((proxy as Record<string, unknown>).name)
      if (name) metadata[name] = proxyNodeInfo(proxy)
    }
  }
  const providers = doc['proxy-providers']
  if (providers && typeof providers === 'object' && !Array.isArray(providers)) {
    for (const provider of Object.values(providers)) {
      if (provider && typeof provider === 'object') add((provider as Record<string, unknown>).payload)
    }
  }
  add(doc.proxies)
  return metadata
}
