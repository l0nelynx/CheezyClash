type NetworkConfig = { 'mixed-port'?: number; port?: number; 'socks-port'?: number; tun?: { enable?: boolean } }

/** Resolve only listeners from the applied controller configuration. */
export function publicIpProxy(config: NetworkConfig): Electron.ProxyConfig {
  const validPort = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0 && Number(value) <= 65535
  const httpPort = [config['mixed-port'], config.port].find(validPort)
  if (httpPort) return { mode: 'fixed_servers', proxyRules: `http://127.0.0.1:${httpPort}`, proxyBypassRules: '<-loopback>' }
  if (validPort(config['socks-port'])) return { mode: 'fixed_servers', proxyRules: `socks5://127.0.0.1:${config['socks-port']}`, proxyBypassRules: '<-loopback>' }
  if (config.tun?.enable) return { mode: 'direct' }
  throw new Error('No active proxy listener')
}
