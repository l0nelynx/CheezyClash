import { useEffect, useState } from 'react'
import type { PublicIpSnapshot } from '../../../shared/types'

/** Poll only local IPC; the main process owns the external request budget. */
export function usePublicIp(route: string | null): PublicIpSnapshot {
  const [snapshot, setSnapshot] = useState<{ route: string | null; value: PublicIpSnapshot }>({ route, value: { state: 'pending' } })
  // Clear synchronously, including A -> disconnected/busy -> A transitions.
  if (snapshot.route !== route) setSnapshot({ route, value: { state: 'pending' } })
  useEffect(() => {
    if (!route) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const read = async (): Promise<void> => {
      try {
        const value = await window.cheezy.getPublicIp()
        if (!cancelled) setSnapshot({ route, value })
      } catch {
        if (!cancelled) setSnapshot({ route, value: { state: 'pending' } })
      } finally {
        if (!cancelled) timer = setTimeout(() => void read(), 2000)
      }
    }
    void read()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [route])
  if (!route) return { state: 'disconnected' }
  return snapshot.route === route ? snapshot.value : { state: 'pending' }
}
