import { useCallback, useEffect, useState } from 'react'
import type {
  AppSettings,
  CoreStatus,
  ProfileMeta,
  ProxyGroupInfo,
  TrafficSnapshot,
  TunStatus,
} from '../../../shared/types'

export type Tab = 'home' | 'proxies' | 'profiles' | 'settings' | 'logs'

export function useCheezyState() {
  const [tab, setTab] = useState<Tab>('home')
  const [status, setStatus] = useState<CoreStatus | null>(null)
  const [traffic, setTraffic] = useState<TrafficSnapshot | null>(null)
  const [groups, setGroups] = useState<ProxyGroupInfo[]>([])
  const [latencies, setLatencies] = useState<Record<string, Record<string, number>>>({})
  const [profiles, setProfiles] = useState<ProfileMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [settings, setSettingsState] = useState<AppSettings | null>(null)
  const [tun, setTun] = useState<TunStatus | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [st, profs, act, set, tunSt, logLines] = await Promise.all([
        window.cheezy.getStatus(),
        window.cheezy.listProfiles(),
        window.cheezy.getActiveProfileId(),
        window.cheezy.getSettings(),
        window.cheezy.getTunStatus(),
        window.cheezy.getLogs(),
      ])
      setStatus(st)
      setProfiles(profs)
      setActiveId(act)
      setSettingsState(set)
      setTun(tunSt)
      setLogs(logLines)
      if (st.running) {
        try {
          setGroups(await window.cheezy.getGroups())
        } catch {
          setGroups([])
        }
        try {
          setTraffic(await window.cheezy.getTraffic())
        } catch {
          /* ignore */
        }
      } else {
        setGroups([])
      }
    } catch (e) {
      setError(String(e))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const offStatus = window.cheezy.onStatus((s) => {
      setStatus(s)
      if (s.running) {
        void window.cheezy.getGroups().then(setGroups).catch(() => undefined)
      } else {
        setGroups([])
      }
    })
    const offLog = window.cheezy.onLog((line) => setLogs((prev) => [...prev.slice(-400), line]))
    const t = setInterval(() => {
      void window.cheezy.getStatus().then(setStatus)
      void window.cheezy
        .getTraffic()
        .then(setTraffic)
        .catch(() => undefined)
      void window.cheezy.getTunStatus().then(setTun).catch(() => undefined)
    }, 2000)
    return () => {
      offStatus()
      offLog()
      clearInterval(t)
    }
  }, [refresh])

  useEffect(() => {
    if (tab === 'proxies' && status?.running) {
      void window.cheezy
        .getGroups()
        .then(setGroups)
        .catch(() => undefined)
    }
  }, [tab, status?.running])

  const run = useCallback(
    async (fn: () => Promise<unknown>): Promise<void> => {
      setBusy(true)
      setError(null)
      try {
        await fn()
        await refresh()
      } catch (e) {
        setError(String(e))
      } finally {
        setBusy(false)
      }
    },
    [refresh],
  )

  const clearError = useCallback(() => setError(null), [])

  const setGroupLatencies = useCallback((group: string, map: Record<string, number>) => {
    setLatencies((prev) => ({ ...prev, [group]: map }))
  }, [])

  return {
    tab,
    setTab,
    status,
    traffic,
    groups,
    latencies,
    setGroupLatencies,
    profiles,
    activeId,
    settings,
    tun,
    logs,
    busy,
    error,
    clearError,
    refresh,
    run,
  }
}

export type CheezyState = ReturnType<typeof useCheezyState>
