import { Loader2, Power, Unplug } from 'lucide-react'
import type { CoreStatus, TunStatus } from '../../../shared/types'
import { DownloadRateSparkline } from './DownloadRateSparkline'
import { formatRate } from '../lib/format'

interface Props {
  status: CoreStatus | null
  tun: TunStatus | null
  busy: boolean
  hasProfile: boolean
  downRateHistory: number[]
  downRate: number
  upRate: number
  onConnect: () => void
  onDisconnect: () => void
  onEnsureHelper: () => void
  onGoProfiles?: () => void
}

export function ConnectHero({
  status,
  tun,
  busy,
  hasProfile,
  downRateHistory,
  downRate,
  upRate,
  onConnect,
  onDisconnect,
  onEnsureHelper,
  onGoProfiles,
}: Props): React.JSX.Element {
  const running = !!status?.running
  const modeLabel = status?.mode === 'tun' ? 'TUN' : 'Proxy'
  const lastError = status?.lastError
    ? status.lastError.includes('no active profile')
      ? 'Import or activate a profile first.'
      : status.lastError
    : null

  return (
    <section className="relative overflow-hidden rounded-xl border border-border bg-card p-8">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-muted blur-3xl" />
      <DownloadRateSparkline
        values={downRateHistory}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-90"
      />

      <div className="relative z-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="section-label mb-3">Connection</p>
            <h2 className="text-3xl font-semibold tracking-tight text-foreground">
              {running ? 'You are connected' : 'Ready to connect'}
            </h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {running
                ? `${modeLabel} mode. Change server below or on Proxies.`
                : hasProfile
                  ? 'Choose Proxy or TUN in Settings, then connect.'
                  : 'Add a subscription or profile file on Profiles, then connect.'}
            </p>
          </div>
          {running && (
            <div className="shrink-0 space-y-1.5 text-right text-xs text-muted-foreground">
              <div>
                <span className="block text-[10px] uppercase tracking-wide">Download</span>
                <span className="font-medium tabular-nums text-foreground">{formatRate(downRate)}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wide">Upload</span>
                <span className="font-medium tabular-nums text-muted-foreground">{formatRate(upRate)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!hasProfile && onGoProfiles ? (
            <button type="button" className="btn-primary min-w-[140px]" onClick={onGoProfiles}>
              Go to Profiles
            </button>
          ) : !running ? (
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

        {lastError && <p className="mt-4 text-sm text-destructive">{lastError}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <span>
            VPN helper:{' '}
            <span className="text-foreground">
              {tun?.helperRunning ? 'running' : tun?.helperInstalled ? 'installed' : 'not installed'}
            </span>
          </span>
          <span>
            Setup:{' '}
            <span className={tun?.privilegesOk ? 'text-ok' : 'text-foreground'}>
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
