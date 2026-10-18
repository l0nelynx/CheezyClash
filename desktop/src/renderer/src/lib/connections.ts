import type { ConnectionInfo, ConnectionsSnapshot } from '../../../shared/types'

export interface LiveConnection extends ConnectionInfo {
  downRate: number | null
  upRate: number | null
}

/** Compare byte counters over the actual sample interval, never the connection's age. */
export function connectionRates(current: ConnectionsSnapshot, previous: ConnectionsSnapshot | null): LiveConnection[] {
  const elapsed = previous ? (current.sampledAt - previous.sampledAt) / 1000 : 0
  const before = new Map(previous?.connections.map(connection => [connection.id, connection]))
  return current.connections.map(connection => {
    const old = before.get(connection.id)
    const comparable = old && old.start === connection.start && elapsed > 0
    const rate = (value: number, prior: number): number | null => {
      const delta = value - prior
      return Number.isFinite(delta) && delta >= 0 ? delta / elapsed : null
    }
    return {
      ...connection,
      downRate: comparable ? rate(connection.download, old.download) : null,
      upRate: comparable ? rate(connection.upload, old.upload) : null,
    }
  })
}

export function connectionProcess(connection: ConnectionInfo): string {
  return connection.metadata.process?.trim() || ''
}

export function connectionRoute(connection: ConnectionInfo): string[] {
  return [...(connection.chains ?? [])].reverse()
}

export function connectionDuration(start: string, now: number): string {
  const parsed = Date.parse(start)
  if (!Number.isFinite(parsed)) return '—'
  const seconds = Math.max(0, Math.floor((now - parsed) / 1000))
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  return hours > 0
    ? `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    : `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export function matchesConnection(connection: ConnectionInfo, query: string): boolean {
  const m = connection.metadata
  return [m.host, m.destinationIP, m.destinationPort, m.sourceIP, m.process, m.processPath,
    m.network, connection.rule, connection.rulePayload, ...connectionRoute(connection)]
    .join(' ').toLowerCase().includes(query.trim().toLowerCase())
}
