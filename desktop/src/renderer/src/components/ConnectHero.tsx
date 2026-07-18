import { Loader2, Power, Shield, Unplug } from 'lucide-react'
import type { CoreStatus, TunStatus } from '../../../shared/types'

interface Props {
  status: CoreStatus | null
  tun: TunStatus | null
  busy: boolean
  onConnectProxy: () => void
  onConnectTun: () => void
  onDisconnect: () => void
  onEnsureHelper: () => void
}

export function ConnectHero({
  status,
  tun,
  busy,
  onConnectProxy,
  onConnectTun,
  onDisconnect,
  onEnsureHelper,
}: Props): React.JSX.Element {
  const running = !!status?.running

  return (
    <section className="relative overflow-hidden rounded-2xl border border-surface-border bg-gradient-to-br from-surface-raised via-surface-raised to-accent-soft p-8">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />

      <p className="section-label mb-3">Connection</p>
      <h2 className="text-3xl font-semibold tracking-tight text-ink">
        {running ? 'You are connected' : 'Ready to connect'}
      </h2>
      <p className="mt-2 max-w-md text-sm text-ink-muted">
        {running
          ? `Running in ${status?.mode?.toUpperCase()} mode. Switch servers on the Proxies page.`
          : 'Proxy needs no admin. TUN uses the Windows helper service once for system routing.'}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!running ? (
          <>
            <button type="button" className="btn-primary min-w-[140px]" disabled={busy} onClick={onConnectProxy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
              Connect proxy
            </button>
            <button type="button" className="btn min-w-[140px]" disabled={busy} onClick={onConnectTun}>
              <Shield className="h-4 w-4" />
              Connect TUN
            </button>
          </>
        ) : (
          <button type="button" className="btn-danger min-w-[140px]" disabled={busy} onClick={onDisconnect}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
            Disconnect
          </button>
        )}
      </div>

      {status?.lastError && (
        <p className="mt-4 text-sm text-danger">{status.lastError}</p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-surface-border/60 pt-4 text-xs text-ink-muted">
        <span>
          Helper:{' '}
          <span className="text-ink">
            {tun?.helperRunning ? 'running' : tun?.helperInstalled ? 'installed' : 'missing'}
          </span>
        </span>
        <span>
          Privileges:{' '}
          <span className={tun?.privilegesOk ? 'text-ok' : 'text-ink'}>
            {tun?.privilegesOk ? 'ok' : 'need setup'}
          </span>
        </span>
        {!tun?.privilegesOk && (
          <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={busy} onClick={onEnsureHelper}>
            Install / start helper
          </button>
        )}
      </div>
    </section>
  )
}
