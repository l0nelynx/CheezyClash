import { useCallback, useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { TitleBar } from './components/TitleBar'
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
  const {
    tab,
    setTab,
    status,
    busy,
    run,
    error,
    notice,
    clearError,
    clearNotice,
    showNotice,
    groups,
    setGroupLatencies,
  } = state
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
    state.activeId != null
      ? (state.profiles.find((p) => p.id === state.activeId) ?? null)
      : null

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
    let failed = 0
    try {
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i]!
        try {
          const map = await window.cheezy.healthCheck(g.name)
          setGroupLatencies(g.name, map)
        } catch {
          failed += 1
        }
        setTestProgress({ done: i + 1, total: groups.length })
      }
      if (failed > 0) {
        showNotice(`Latency test finished with ${failed} group${failed === 1 ? '' : 's'} failed`)
      } else {
        showNotice('Latency test finished')
      }
    } finally {
      setTestingAll(false)
      setTestProgress(null)
    }
  }, [groups, setGroupLatencies, showNotice])

  if (!authReady || !caps) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>
    )
  }

  if (caps.supportsAuth && !session?.email) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <TitleBar status={null} productName={caps.productName} />
        <div className="min-h-0 flex-1">
          <LoginPage
            productName={caps.productName}
            onLoggedIn={() => {
              void refreshAuth().then(() => state.refresh())
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <AppShell
      tab={tab}
      onTab={setTab}
      status={status}
      error={error}
      notice={notice}
      onClearError={clearError}
      onClearNotice={clearNotice}
      productName={caps.productName}
    >
      {tab === 'home' && (
        <HomePage
          status={status}
          tun={state.tun}
          traffic={state.traffic}
          downRateHistory={state.downRateHistory}
          activeProfile={activeProfile}
          groups={groups}
          latencies={state.latencies}
          busy={busy}
          onConnect={() => run(() => window.cheezy.connect(), { success: 'Connected', scope: 'home' })}
          onDisconnect={() =>
            run(() => window.cheezy.disconnect(), { success: 'Disconnected', scope: 'home' })
          }
          onEnsureHelper={() => run(() => window.cheezy.ensureHelper(), { scope: 'home' })}
          onGoProfiles={() => setTab('profiles')}
          onSelectServer={(group, name) =>
            run(() => window.cheezy.selectProxy(group, name), { scope: 'home' })
          }
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
          onSelect={(group, name) =>
            run(() => window.cheezy.selectProxy(group, name), { scope: 'proxies' })
          }
          onHealth={(group) => run(() => healthOne(group), { scope: 'proxies' })}
          onHealthAll={() => void healthAll()}
        />
      )}

      {tab === 'profiles' && (
        <ProfilesPage
          profiles={state.profiles}
          activeId={state.activeId}
          busy={busy}
          onImportUrl={async (url) => {
            await run(() => window.cheezy.importProfileUrl(url), {
              success: 'Profile imported',
              scope: 'profiles',
            })
          }}
          onImportFile={() =>
            run(() => window.cheezy.importProfileFile(), {
              success: 'Profile imported',
              scope: 'profiles',
            })
          }
          onActivate={(id) =>
            run(() => window.cheezy.setActiveProfile(id), {
              success: 'Profile activated',
              scope: 'profiles',
            })
          }
          onUpdate={(id) =>
            run(() => window.cheezy.updateProfile(id), {
              success: 'Subscription updated',
              scope: 'profiles',
            })
          }
          onDelete={(id) =>
            run(() => window.cheezy.deleteProfile(id), {
              success: 'Profile deleted',
              scope: 'profiles',
            })
          }
        />
      )}

      {tab === 'settings' &&
        (state.settings ? (
          <SettingsPage
            settings={state.settings}
            busy={busy}
            session={session}
            supportsAuth={caps.supportsAuth}
            status={status}
            onPatch={(patch) => run(() => window.cheezy.setSettings(patch), { scope: 'settings' })}
            onConnectionMode={(mode) =>
              run(() => window.cheezy.setConnectionMode(mode), { scope: 'settings' })
            }
            onAccessControlChange={async (rules) => {
              await window.cheezy.setAccessControlRules(rules)
              await state.refresh()
              showNotice('Access rules saved')
            }}
            onLogout={() =>
              run(
                async () => {
                  await window.cheezy.privateLogout()
                  await refreshAuth()
                },
                { scope: 'settings' },
              )
            }
            onSyncSubscription={() =>
              run(
                async () => {
                  await window.cheezy.privateSyncSubscription()
                  await state.refresh()
                },
                { success: 'Subscription synced', scope: 'settings' },
              )
            }
          />
        ) : (
          <div className="mx-auto max-w-3xl py-12 text-center text-sm text-muted-foreground">Loading settings…</div>
        ))}

      {tab === 'logs' && <LogsPage logs={state.logs} />}

      {tab === 'about' && <AboutPage productName={caps.productName} />}
    </AppShell>
  )
}
