import { useCallback, useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { useCheezyState } from './hooks/useCheezyState'
import { AboutPage } from './pages/AboutPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { LogsPage } from './pages/LogsPage'
import { ProfilesPage } from './pages/ProfilesPage'
import { ProxiesPage } from './pages/ProxiesPage'
import { SettingsPage } from './pages/SettingsPage'
import type { PrivateAccountSession, PrivateCapabilities } from '../../shared/private-api'

export default function App(): React.JSX.Element {
  const state = useCheezyState()
  const { tab, setTab, status, busy, run, error, clearError, groups, setGroupLatencies } = state
  const [testingAll, setTestingAll] = useState(false)
  const [testProgress, setTestProgress] = useState<{ done: number; total: number } | null>(null)
  const [caps, setCaps] = useState<PrivateCapabilities | null>(null)
  const [session, setSession] = useState<PrivateAccountSession | null>(null)
  const [authReady, setAuthReady] = useState(false)

  const refreshAuth = useCallback(async () => {
    const c = await window.cheezy.privateCapabilities()
    setCaps(c)
    if (c.supportsAuth) {
      const s = await window.cheezy.privateGetSession()
      setSession(s)
    } else {
      setSession(null)
    }
    setAuthReady(true)
  }, [])

  useEffect(() => {
    void refreshAuth()
  }, [refreshAuth])

  useEffect(() => {
    if (caps?.productName) document.title = caps.productName
  }, [caps?.productName])

  const activeProfile =
    state.profiles.find((p) => p.id === state.activeId) ?? state.profiles[0] ?? null

  const healthOne = useCallback(
    async (group: string) => {
      const map = await window.cheezy.healthCheck(group)
      setGroupLatencies(group, map)
    },
    [setGroupLatencies],
  )

  const healthAll = useCallback(async () => {
    if (groups.length === 0) return
    setTestingAll(true)
    setTestProgress({ done: 0, total: groups.length })
    try {
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i]!
        try {
          const map = await window.cheezy.healthCheck(g.name)
          setGroupLatencies(g.name, map)
        } catch {
          /* continue */
        }
        setTestProgress({ done: i + 1, total: groups.length })
      }
    } finally {
      setTestingAll(false)
      setTestProgress(null)
    }
  }, [groups, setGroupLatencies])

  if (!authReady || !caps) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-muted">Loading…</div>
    )
  }

  if (caps.supportsAuth && !session?.email) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <LoginPage
          productName={caps.productName}
          onLoggedIn={() => {
            void refreshAuth().then(() => state.refresh())
          }}
        />
      </div>
    )
  }

  return (
    <AppShell
      tab={tab}
      onTab={setTab}
      status={status}
      error={error}
      onClearError={clearError}
      productName={caps.productName}
    >
      {tab === 'home' && (
        <HomePage
          status={status}
          tun={state.tun}
          traffic={state.traffic}
          activeProfile={activeProfile}
          busy={busy}
          onConnectProxy={() => run(() => window.cheezy.connect('proxy'))}
          onConnectTun={() => run(() => window.cheezy.connect('tun'))}
          onDisconnect={() => run(() => window.cheezy.disconnect())}
          onEnsureHelper={() => run(() => window.cheezy.ensureHelper())}
        />
      )}

      {tab === 'proxies' && (
        <ProxiesPage
          groups={groups}
          latencies={state.latencies}
          busy={busy}
          running={!!status?.running}
          testingAll={testingAll}
          testProgress={testProgress}
          onSelect={(group, name) => run(() => window.cheezy.selectProxy(group, name))}
          onHealth={(group) => run(() => healthOne(group))}
          onHealthAll={() => void healthAll()}
        />
      )}

      {tab === 'profiles' && (
        <ProfilesPage
          profiles={state.profiles}
          activeId={state.activeId}
          busy={busy}
          onImportUrl={async (url) => {
            await run(() => window.cheezy.importProfileUrl(url))
          }}
          onImportFile={() => run(() => window.cheezy.importProfileFile())}
          onActivate={(id) => run(() => window.cheezy.setActiveProfile(id))}
          onDelete={(id) => run(() => window.cheezy.deleteProfile(id))}
        />
      )}

      {tab === 'settings' && state.settings && (
        <SettingsPage
          settings={state.settings}
          busy={busy}
          session={session}
          supportsAuth={caps.supportsAuth}
          status={status}
          onPatch={(patch) => run(() => window.cheezy.setSettings(patch))}
          onTunPrefer={(enabled) => run(() => window.cheezy.setTunEnabled(enabled))}
          onLogout={() =>
            run(async () => {
              await window.cheezy.privateLogout()
              await refreshAuth()
            })
          }
          onSyncSubscription={() =>
            run(async () => {
              await window.cheezy.privateSyncSubscription()
              await state.refresh()
            })
          }
        />
      )}

      {tab === 'logs' && <LogsPage logs={state.logs} />}

      {tab === 'about' && <AboutPage productName={caps.productName} />}
    </AppShell>
  )
}
