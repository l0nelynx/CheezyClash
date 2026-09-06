import { ExternalLink, LifeBuoy, Loader2, Power, Unplug } from 'lucide-react'
import type { CoreStatus, ProfileMeta, TunStatus } from '../../../shared/types'
import { DownloadRateSparkline } from './DownloadRateSparkline'
import { formatRate } from '../lib/format'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

interface Props {
  connectionAction: string | null
  status: CoreStatus | null
  tun: TunStatus | null
  busy: boolean
  hasProfile: boolean
  activeProfile: ProfileMeta | null
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
  connectionAction,
  tun,
  busy,
  hasProfile,
  activeProfile,
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
  const subscription = activeProfile?.subscription
  const connectedTitle = subscription?.title?.trim() || activeProfile?.name || 'Connected'
  const lastError = status?.lastError
    ? status.lastError.includes('no active profile')
      ? 'Import or activate a profile first.'
      : status.lastError
    : null

  return (
    <section className="page-card relative overflow-hidden p-7 sm:p-8">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-muted blur-3xl" />
      <DownloadRateSparkline
        values={downRateHistory}
        accentColor={subscription?.accentColor}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-80"
      />

      <div className="relative z-10">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              <p className="section-label">Connection</p>
              <Badge variant={running ? 'success' : 'secondary'} className="px-2 py-0 text-[10px]">
                {connectionAction ?? (running ? 'Core running' : 'Disconnected')}
              </Badge>
            </div>
            <h2
              className="line-clamp-2 max-w-xl text-3xl font-semibold tracking-tight text-foreground"
              title={running ? connectedTitle : undefined}
            >
              {running ? connectedTitle : 'Ready to connect'}
            </h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {running
                ? modeLabel === 'TUN' ? 'TUN is running. Routing follows the profile rules.' : 'Proxy is running. Use the system proxy or configure your apps to route traffic through it.'
                : hasProfile
                  ? 'Choose Proxy or TUN in Settings, then connect.'
                  : 'Add a subscription or profile file on Profiles, then connect.'}
            </p>
            {(activeProfile?.url || subscription?.supportUrl) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {activeProfile?.url && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    title="Open the current subscription URL"
                    onClick={() => void window.cheezy.openExternal(activeProfile.url!)}
                  >
                    <ExternalLink />
                    Subscription
                  </Button>
                )}
                {subscription?.supportUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    title="Open subscription support"
                    onClick={() => void window.cheezy.openExternal(subscription.supportUrl!)}
                  >
                    <LifeBuoy />
                    Support
                  </Button>
                )}
              </div>
            )}
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
            <Button type="button" className="min-w-[140px]" onClick={onGoProfiles}>
              Go to Profiles
            </Button>
          ) : !running ? (
            <Button type="button" className="min-w-[140px]" disabled={busy} onClick={onConnect}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
              {connectionAction ?? 'Connect'}
            </Button>
          ) : (
            <Button type="button" variant="destructive" className="min-w-[140px]" disabled={busy} onClick={onDisconnect}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
              {connectionAction ?? 'Disconnect'}
            </Button>
          )}
        </div>

        {lastError && <p className="mt-4 text-sm text-destructive">{lastError}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <span>
            Mode: <span className="font-medium text-foreground">{modeLabel}</span>
          </span>
          {tun?.enabled && <><span>
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
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2" disabled={busy} onClick={onEnsureHelper}>
              Install helper
            </Button>
          )}</>}
        </div>
      </div>
    </section>
  )
}
