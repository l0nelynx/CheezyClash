import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AppSettings,
  CoreStatus,
  ProfileMeta,
  ProxyGroupInfo,
  TrafficSnapshot,
  TunStatus,
} from '../../../shared/types'

export type Tab = 'home' | 'proxies' | 'profiles' | 'settings' | 'logs' | 'about'

const DOWN_RATE_HISTORY = 60
const NOTICE_MS = 4000

export function useCheezyState() {
  const [tab, setTab] = useState<Tab>('home')
  const [status, setStatus] = useState<CoreStatus | null>(null)
  const [traffic, setTraffic] = useState<TrafficSnapshot | null>(null)
  const [downRateHistory, setDownRateHistory] = useState<number[]>([])
  const [groups, setGroups] = useState<ProxyGroupInfo[]>([])
  const [latencies, setLatencies] = useState<Record<string, Record<string, number>>>({})
  const [profiles, setProfiles] = useState<ProfileMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [settings, setSettingsState] = useState<AppSettings | null>(null)
  const [tun, setTun] = useState<TunStatus | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [busyScope, setBusyScope] = useState<Tab | 'global' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const runningRef = useRef(false)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pushDownRate = useCallback((down: number, running: boolean) => {
    if (!running) {
      setDownRateHistory([])
      return
    }
    setDownRateHistory((prev) => {
      const next = [...prev, Math.max(0, down)]
      if (next.length > DOWN_RATE_HISTORY) next.splice(0, next.length - DOWN_RATE_HISTORY)
      return next
    })
  }, [])

  const showNotice = useCallback((msg: string) => {
    setNotice(msg)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS)
  }, [])

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
      runningRef.current = !!st.running
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
          const t = await window.cheezy.getTraffic()
          setTraffic(t)
          pushDownRate(t.down, true)
        } catch {
          /* ignore */
        }
      } else {
        setGroups([])
        setTraffic(null)
        setDownRateHistory([])
      }
    } catch (e) {
      setError(String(e))
    }
  }, [pushDownRate])

  useEffect(() => {
    void refresh()
    const offStatus = window.cheezy.onStatus((s) => {
      setStatus(s)
      runningRef.current = !!s.running
      if (s.running) {
        void window.cheezy.getGroups().then(setGroups).catch(() => undefined)
      } else {
        setGroups([])
        setTraffic(null)
        setDownRateHistory([])
      }
    })
    const offProfiles = window.cheezy.onProfilesChanged(() => {
      void window.cheezy.listProfiles().then(setProfiles).catch(() => undefined)
      void window.cheezy.getActiveProfileId().then(setActiveId).catch(() => undefined)
    })
    const offLog = window.cheezy.onLog((line) => setLogs((prev) => [...prev.slice(-400), line]))
    const statusTick = setInterval(() => {
      void window.cheezy.getStatus().then((s) => {
        setStatus(s)
        runningRef.current = !!s.running
        if (!s.running) {
          setTraffic(null)
          setDownRateHistory([])
        }
      })
      void window.cheezy.getTunStatus().then(setTun).catch(() => undefined)
    }, 2000)
    const trafficTick = setInterval(() => {
      if (!runningRef.current) return
      void window.cheezy
        .getTraffic()
        .then((t) => {
          setTraffic(t)
          pushDownRate(t.down, runningRef.current)
        })
        .catch(() => undefined)
    }, 1000)
    return () => {
      offStatus()
      offProfiles()
      offLog()
      clearInterval(statusTick)
      clearInterval(trafficTick)
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    }
  }, [refresh, pushDownRate])

  useEffect(() => {
    if (tab === 'proxies' && status?.running) {
      void window.cheezy
        .getGroups()
        .then(setGroups)
        .catch(() => undefined)
    }
  }, [tab, status?.running])

  const run = useCallback(
    async (
      fn: () => Promise<unknown>,
      opts?: { success?: string; scope?: Tab | 'global' },
    ): Promise<void> => {
      setBusy(true)
      setBusyScope(opts?.scope ?? tab)
      setError(null)
      try {
        await fn()
        await refresh()
        if (opts?.success) showNotice(opts.success)
      } catch (e) {
        setError(String(e))
      } finally {
        setBusy(false)
        setBusyScope(null)
      }
    },
    [refresh, showNotice, tab],
  )

  const clearError = useCallback(() => setError(null), [])
  const clearNotice = useCallback(() => setNotice(null), [])

  const setGroupLatencies = useCallback((group: string, map: Record<string, number>) => {
    setLatencies((prev) => ({ ...prev, [group]: map }))
  }, [])

  /** Busy only locks the current tab (or global when scope is global). */
  const tabBusy = busy && (busyScope === 'global' || busyScope === tab)

  return {
    tab,
    setTab,
    status,
    traffic,
    downRateHistory,
    groups,
    latencies,
    setGroupLatencies,
    profiles,
    activeId,
    settings,
    tun,
    logs,
    busy: tabBusy,
    error,
    notice,
    clearError,
    clearNotice,
    showNotice,
    refresh,
    run,
  }
}

export type CheezyState = ReturnType<typeof useCheezyState>
