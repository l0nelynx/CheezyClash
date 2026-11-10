import { session } from 'electron'
import { getStatus } from './core-manager'
import { mihomoApi } from './mihomo-api'
import { PublicIpMonitor } from './public-ip-monitor'
import type { CoreStatus, ProxyGroupInfo, PublicIpSnapshot } from '../shared/types'
import { publicIpProxy } from './public-ip-proxy'
export { publicIpProxy } from './public-ip-proxy'

type NetworkConfig = { 'mixed-port'?: number; port?: number; 'socks-port'?: number; tun?: { enable?: boolean } }

const monitor = new PublicIpMonitor(async (url, signal) => {
  // Read applied controller settings, never an edited or refreshed profile file.
  const config = await mihomoApi.request<NetworkConfig>('GET', '/configs', undefined, 3000)
  signal.throwIfAborted()
  const isolated = session.fromPartition('public-ip', { cache: false })
  await isolated.closeAllConnections()
  await isolated.setProxy(publicIpProxy(config))
  signal.throwIfAborted()
  return isolated.fetch(url, { signal, cache: 'no-store', credentials: 'omit', redirect: 'error' })
})
let generation = 0
let selectionsInFlight = 0
let statusKey = ''
let groupsKey = ''
let verifiedAt = -Infinity

export function invalidatePublicIp(): void {
  generation++
  verifiedAt = -Infinity
  monitor.setRoute(null)
}

export function observePublicIpStatus(status: CoreStatus): void {
  const next = JSON.stringify([status.running, status.connectedAt, status.mode])
  if (next !== statusKey) {
    statusKey = next
    invalidatePublicIp()
  }
}

export function observePublicIpGroups(groups: ProxyGroupInfo[]): void {
  const next = JSON.stringify(groups.map(group => [group.name, group.now]).sort(([a], [b]) => a.localeCompare(b)))
  if (next !== groupsKey) {
    groupsKey = next
    invalidatePublicIp()
  }
}

export function beginPublicIpSelection(): () => void {
  selectionsInFlight++
  invalidatePublicIp()
  return () => { selectionsInFlight--; invalidatePublicIp() }
}

export async function getPublicIp(): Promise<PublicIpSnapshot> {
  const pending: PublicIpSnapshot = { state: 'pending' }
  if (selectionsInFlight) return pending
  // Existing status/group polling invalidates immediately; avoid running Windows
  // service checks and rebuilding thousands of proxy entries on every UI read.
  if (Date.now() - verifiedAt < 15_000) return monitor.snapshot()
  const initialGeneration = generation
  try {
    const status = await getStatus()
    if (initialGeneration !== generation) return pending
    observePublicIpStatus(status)
    if (!status.running) return { state: 'disconnected' }
    const stamp = generation
    const proxies = await mihomoApi.getProxies()
    if (stamp !== generation || selectionsInFlight) return pending
    // Include hidden nested/automatic selectors, without constructing UI metadata.
    const selections = Object.entries(proxies)
      .filter(([, proxy]) => typeof proxy.now === 'string')
      .map(([name, proxy]) => [name, proxy.now])
      .sort(([a], [b]) => (a ?? '').localeCompare(b ?? ''))
    monitor.setRoute(JSON.stringify([statusKey, stamp, selections]))
    verifiedAt = Date.now()
    return monitor.snapshot()
  } catch {
    invalidatePublicIp()
    return pending
  }
}
