import { useCallback, useEffect, useRef, useState } from 'react'
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
import { shouldShowLogin } from './lib/auth-gate'
import { withDeadline } from './lib/deadline'
import { Button } from './components/ui/button'
import type { PrivateAccountSession, PrivateCapabilities } from '../../shared/private-api'
import type { DeepLinkResult } from '../../shared/deep-link'

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
    refresh,
  } = state
  const [testingAll, setTestingAll] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const download = async (work: () => Promise<unknown>, success: string): Promise<boolean> => {
    setDownloading(true)
    try { return await run(work, { success, scope: 'profiles' }) }
    finally { setDownloading(false) }
  }
  const [testProgress, setTestProgress] = useState<{ done: number; total: number } | null>(null)
  const [caps, setCaps] = useState<PrivateCapabilities | null>(null)
  const [session, setSession] = useState<PrivateAccountSession | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const authGeneration = useRef(0)
  const [authHandoffError, setAuthHandoffError] = useState<string | null>(null)
  const [loginRequested, setLoginRequested] = useState(false)
  const handledDeepLinkSequence = useRef(0)
  const lastCustomRuleDiagnosticAt = useRef(0)

  const refreshAuth = useCallback(async () => {
    const generation = ++authGeneration.current
    setBootError(null)
    try {
      const { c, s } = await withDeadline((async () => {
        const c = await window.cheezy.privateCapabilities()
        const s = c.supportsAuth ? await window.cheezy.privateGetSession() : null
        return { c, s }
      })(), 15_000)
      if (generation !== authGeneration.current) return
      setCaps(c)
      setSession(s)
      setAuthReady(true)
    } catch (error) {
      if (generation === authGeneration.current) {
        setBootError('Could not load the app. Check your connection and try again.')
      }
      throw error
    }
  }, [])

  useEffect(() => {
    void refreshAuth().catch(() => undefined)
    return () => { authGeneration.current++ }
  }, [refreshAuth])

  const handleDeepLinkResult = useCallback(
    (result: DeepLinkResult) => {
      if (result.sequence <= handledDeepLinkSequence.current) return
      handledDeepLinkSequence.current = result.sequence

      if (result.kind === 'login') {
        if (result.status === 'success') {
          setAuthHandoffError(null)
          setLoginRequested(false)
          setTab('home')
          if (result.session?.email) {
            setSession(result.session)
            setAuthReady(true)
          }
          void refreshAuth()
            .then(() => refresh())
            .then(() => showNotice('Signed in successfully'))
            .catch(() => undefined)
          return
        }
        const messages = {
          expired: 'The browser sign-in link expired. Return to the browser and try again.',
          network: 'Could not reach the sign-in service. Check your connection and try again.',
          server: 'Could not complete browser sign-in. Please try again.',
        }
        setAuthHandoffError(messages[result.error])
        setLoginRequested(true)
        return
      }

      if (result.status === 'success') {
        void refresh().then(() => showNotice('Subscription imported'))
      } else {
        showNotice('Could not import the subscription')
      }
    },
    [refresh, refreshAuth, setTab, showNotice],
  )

  useEffect(() => {
    const off = window.cheezy.onDeepLinkResult(handleDeepLinkResult)
    void window.cheezy.consumeDeepLinkResult().then((result) => {
      if (result) handleDeepLinkResult(result)
    })
    return off
  }, [handleDeepLinkResult])

  useEffect(() => {
    return window.cheezy.onCustomRuleDiagnostics((diagnostics) => {
      if (diagnostics.length === 0) return
      lastCustomRuleDiagnosticAt.current = Date.now()
      if (diagnostics.length === 1) {
        const diagnostic = diagnostics[0]!
        showNotice(`Custom Rule skipped for “${diagnostic.profileName}”: ${diagnostic.reason}`)
        return
      }
      const profileCount = new Set(diagnostics.map((diagnostic) => diagnostic.profileId)).size
      showNotice(
        `${diagnostics.length} Custom Rules skipped for ${profileCount} profile${profileCount === 1 ? '' : 's'}`,
      )
    })
  }, [showNotice])

  useEffect(() => {
    if (caps?.productName) document.title = caps.productName
  }, [caps?.productName])

  const activeProfile =
    state.activeId != null ? (state.profiles.find((p) => p.id === state.activeId) ?? null) : null

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

  if (bootError || !authReady || !caps || !state.ready) {
    return (
      <div className="flex h-full flex-col">
        <TitleBar status={status} productName={caps?.productName ?? 'CheezyClash'} />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center text-sm text-muted-foreground">
          <p role={bootError ? 'alert' : 'status'}>{bootError ?? 'Loading…'}</p>
          {bootError && <Button onClick={() => {
            void refreshAuth().then(() => refresh()).catch(() => undefined)
          }}>Try again</Button>}
        </div>
      </div>
    )
  }

  const showLogin = shouldShowLogin({
    supportsAuth: caps.supportsAuth,
    hasSession: !!session?.email,
    hasProfiles: state.profiles.length > 0,
    loginRequested,
  })

  if (showLogin) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <TitleBar status={null} productName={caps.productName} />
        <div className="min-h-0 flex-1">
          <LoginPage
            productName={caps.productName}
            handoffError={authHandoffError}
            onImportUrl={async (url) => {
              await window.cheezy.importProfileUrl(url)
              await state.refresh()
              setAuthHandoffError(null)
              setLoginRequested(false)
              showNotice('Subscription imported')
            }}
            onCancel={state.profiles.length > 0 ? () => setLoginRequested(false) : undefined}
            onLoggedIn={() => {
              setAuthHandoffError(null)
              setLoginRequested(false)
              void refreshAuth().then(() => state.refresh()).catch(() => undefined)
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
          onConnect={() =>
            run(() => window.cheezy.connect(), { success: 'Connected', scope: 'home' })
          }
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
          downloading={downloading}
          busy={busy}
          onImportUrl={async (url) => {
            return download(() => window.cheezy.importProfileUrl(url), 'Profile imported')
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
            download(() => window.cheezy.updateProfile(id), 'Subscription updated')
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
            onCustomRulesChange={async (rules) => {
              await window.cheezy.setCustomRules(rules)
              await state.refresh()
              if (Date.now() - lastCustomRuleDiagnosticAt.current > 1_000) {
                showNotice('Custom rules saved')
              }
            }}
            onLogin={() => {
              setAuthHandoffError(null)
              setLoginRequested(true)
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
          <div className="mx-auto max-w-3xl py-12 text-center text-sm text-muted-foreground">
            Loading settings…
          </div>
        ))}

      {tab === 'logs' && <LogsPage logs={state.logs} />}

      {tab === 'about' && <AboutPage productName={caps.productName} />}
    </AppShell>
  )
}
