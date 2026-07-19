import { Loader2, Power, Unplug } from 'lucide-react'
import type { CoreStatus, TunStatus } from '../../../shared/types'
import { DownloadRateSparkline } from './DownloadRateSparkline'
import { formatRate } from '../lib/format'

interface Props {
  status: CoreStatus | null
  tun: TunStatus | null
  busy: boolean
  downRateHistory: number[]
  downRate: number
  onConnect: () => void
  onDisconnect: () => void
  onEnsureHelper: () => void
}

export function ConnectHero({
  status,
  tun,
  busy,
  downRateHistory,
  downRate,
  onConnect,
  onDisconnect,
  onEnsureHelper,
}: Props): React.JSX.Element {
  const running = !!status?.running
  const modeLabel = status?.mode === 'tun' ? 'TUN' : 'Proxy'

  return (
    <section className="relative overflow-hidden rounded-2xl border border-surface-border bg-gradient-to-br from-surface-raised via-surface-raised to-accent-soft p-8">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
      <DownloadRateSparkline
        values={downRateHistory}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-90"
      />

      <div className="relative z-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="section-label mb-3">Connection</p>
            <h2 className="text-3xl font-semibold tracking-tight text-ink">
              {running ? 'You are connected' : 'Ready to connect'}
            </h2>
            <p className="mt-2 max-w-md text-sm text-ink-muted">
              {running
                ? `${modeLabel} mode. Change servers on the Proxies page.`
                : 'Choose Proxy or TUN in Settings, then connect.'}
            </p>
          </div>
          {running && downRateHistory.length >= 2 && (
            <p className="shrink-0 text-right text-xs text-ink-dim">
              <span className="block text-[10px] uppercase tracking-wide">Download</span>
              <span className="font-medium text-accent">{formatRate(downRate)}</span>
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!running ? (
            <button type="button" className="btn-primary min-w-[140px]" disabled={busy} onClick={onConnect}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
              Connect
            </button>
          ) : (
            <button type="button" className="btn-danger min-w-[140px]" disabled={busy} onClick={onDisconnect}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
              Disconnect
            </button>
          )}
        </div>

        {status?.lastError && <p className="mt-4 text-sm text-danger">{status.lastError}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-surface-border/60 pt-4 text-xs text-ink-muted">
          <span>
            VPN helper:{' '}
            <span className="text-ink">
              {tun?.helperRunning ? 'running' : tun?.helperInstalled ? 'installed' : 'not installed'}
            </span>
          </span>
          <span>
            Setup:{' '}
            <span className={tun?.privilegesOk ? 'text-ok' : 'text-ink'}>
              {tun?.privilegesOk ? 'ready' : 'needs setup'}
            </span>
          </span>
          {!tun?.privilegesOk && (
            <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={busy} onClick={onEnsureHelper}>
              Install helper
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
