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
const STATUS_POLL_MS = 20_000
const TUN_POLL_MS = 30_000
const GROUPS_POLL_MS = 15_000

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('no active profile')) {
    return 'Import or activate a profile first (Profiles tab).'
  }
  if (msg.includes('helper service')) {
    return 'TUN on Windows needs the helper service — use Settings → Install helper, or switch to Proxy mode.'
  }
  return msg
}

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
  const tabRef = useRef<Tab>('home')
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    tabRef.current = tab
  }, [tab])

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

  /** Apply groups and merge core history delays into latency map. */
  const applyGroups = useCallback((gs: ProxyGroupInfo[]) => {
    setGroups(gs)
    setLatencies((prev) => {
      const next = { ...prev }
      for (const g of gs) {
        if (!g.delays || Object.keys(g.delays).length === 0) continue
        next[g.name] = { ...(next[g.name] || {}), ...g.delays }
      }
      return next
    })
  }, [])

  const showNotice = useCallback((msg: string) => {
    setNotice(msg)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS)
  }, [])

  const refresh = useCallback(
    async (opts?: { includeLogs?: boolean }) => {
      try {
        const includeLogs = opts?.includeLogs ?? tabRef.current === 'logs'
        const [st, profs, act, set, tunSt, logLines] = await Promise.all([
          window.cheezy.getStatus(),
          window.cheezy.listProfiles(),
          window.cheezy.getActiveProfileId(),
          window.cheezy.getSettings(),
          window.cheezy.getTunStatus(),
          includeLogs ? window.cheezy.getLogs() : Promise.resolve(null),
        ])
        setStatus(st)
        runningRef.current = !!st.running
        setProfiles(profs)
        setActiveId(act)
        setSettingsState(set)
        setTun(tunSt)
        if (logLines) setLogs(logLines)
        if (st.running) {
          try {
            applyGroups(await window.cheezy.getGroups())
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
          setLatencies({})
          setTraffic(null)
          setDownRateHistory([])
        }
      } catch (e) {
        setError(friendlyError(e))
      }
    },
    [applyGroups, pushDownRate],
  )

  useEffect(() => {
    void refresh({ includeLogs: false })
    const offStatus = window.cheezy.onStatus((s) => {
      setStatus(s)
      runningRef.current = !!s.running
      if (s.running) {
        void window.cheezy
          .getGroups()
          .then(applyGroups)
          .catch(() => undefined)
      } else {
        setGroups([])
        setLatencies({})
        setTraffic(null)
        setDownRateHistory([])
      }
    })
    const offProfiles = window.cheezy.onProfilesChanged(() => {
      void window.cheezy.listProfiles().then(setProfiles).catch(() => undefined)
      void window.cheezy.getActiveProfileId().then(setActiveId).catch(() => undefined)
    })

    const statusTick = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      void window.cheezy.getStatus().then((s) => {
        setStatus(s)
        runningRef.current = !!s.running
        if (!s.running) {
          setTraffic(null)
          setDownRateHistory([])
          setLatencies({})
        }
      })
    }, STATUS_POLL_MS)

    const tunTick = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      const t = tabRef.current
      if (t !== 'home' && t !== 'settings') return
      void window.cheezy.getTunStatus().then(setTun).catch(() => undefined)
    }, TUN_POLL_MS)

    const trafficTick = setInterval(() => {
      if (document.visibilityState === 'hidden' || !runningRef.current) return
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
      clearInterval(statusTick)
      clearInterval(tunTick)
      clearInterval(trafficTick)
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    }
  }, [refresh, pushDownRate, applyGroups])

  useEffect(() => {
    if (tab !== 'logs') return
    void window.cheezy.getLogs().then(setLogs).catch(() => undefined)
    const offLog = window.cheezy.onLog((line) => setLogs((prev) => [...prev.slice(-400), line]))
    return () => offLog()
  }, [tab])

  useEffect(() => {
    if ((tab !== 'proxies' && tab !== 'home') || !status?.running) return
    const load = (): void => {
      void window.cheezy
        .getGroups()
        .then(applyGroups)
        .catch(() => undefined)
    }
    load()
    const tick = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      load()
    }, GROUPS_POLL_MS)
    return () => clearInterval(tick)
  }, [tab, status?.running, applyGroups])

  const run = useCallback(
    async (
      fn: () => Promise<unknown>,
      opts?: { success?: string; scope?: Tab | 'global' },
    ): Promise<void> => {
      setBusy(true)
      setBusyScope(opts?.scope ?? tab)
      setError(null)
      try {
        const result = await fn()
        await refresh({ includeLogs: tabRef.current === 'logs' })
        if (opts?.success && result !== null && result !== false) showNotice(opts.success)
      } catch (e) {
        setError(friendlyError(e))
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
