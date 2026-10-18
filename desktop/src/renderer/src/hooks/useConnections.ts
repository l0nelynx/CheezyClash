import { useEffect, useState } from 'react'
import type { ConnectionsSnapshot } from '../../../shared/types'
import { connectionRates, type LiveConnection } from '../lib/connections'

export function useConnections(running: boolean) {
  const [connections, setConnections] = useState<LiveConnection[]>([])
  const [loading, setLoading] = useState(running)
  const [failed, setFailed] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(0)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let previous: ConnectionsSnapshot | null = null
    setConnections([])
    setFailed(false)
    setLoading(running)
    setUpdatedAt(0)
    if (!running) return

    const poll = async (): Promise<void> => {
      try {
        const snapshot = await window.cheezy.getConnections()
        if (disposed) return
        setConnections(connectionRates(snapshot, previous))
        setUpdatedAt(snapshot.sampledAt)
        previous = snapshot
        setFailed(false)
      } catch {
        if (disposed) return
        // Do not present stale rows or rates as active connections after a failure.
        previous = null
        setConnections([])
        setFailed(true)
      } finally {
        if (!disposed) {
          setLoading(false)
          timer = setTimeout(() => void poll(), 1000)
        }
      }
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer) }
  }, [running, retry])

  return { connections, loading, failed, updatedAt, retry: () => setRetry(value => value + 1) }
}
