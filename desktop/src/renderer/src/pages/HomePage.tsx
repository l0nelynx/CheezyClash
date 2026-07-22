import { useState } from 'react'
import { X } from 'lucide-react'
import type {
  CoreStatus,
  ProfileMeta,
  ProxyGroupInfo,
  TrafficSnapshot,
  TunStatus,
} from '../../../shared/types'
import { pickPrimaryGroup } from '../lib/proxy-groups'
import { ActiveServerCard } from '../components/ActiveServerCard'
import { ConnectHero } from '../components/ConnectHero'
import { SubscriptionCard } from '../components/SubscriptionCard'
import { TrafficStrip } from '../components/TrafficStrip'

interface Props {
  status: CoreStatus | null
  tun: TunStatus | null
  traffic: TrafficSnapshot | null
  downRateHistory: number[]
  activeProfile: ProfileMeta | null
  groups: ProxyGroupInfo[]
  latencies: Record<string, Record<string, number>>
  busy: boolean
  onConnect: () => void
  onDisconnect: () => void
  onEnsureHelper: () => void
  onGoProfiles: () => void
  onSelectServer: (group: string, name: string) => void
}

export function HomePage(props: Props): React.JSX.Element {
  const sub = props.activeProfile?.subscription
  const announce = sub?.announce
  const [dismissedAnnounce, setDismissedAnnounce] = useState<string | null>(null)
  const showAnnounce = !!announce && announce !== dismissedAnnounce
  const running = !!props.status?.running
  const primaryGroup = running ? pickPrimaryGroup(props.groups) : null
  const hasProfile = !!props.activeProfile

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <ConnectHero
        status={props.status}
        tun={props.tun}
        busy={props.busy}
        hasProfile={hasProfile}
        downRateHistory={props.downRateHistory}
        downRate={props.traffic?.down ?? 0}
        upRate={props.traffic?.up ?? 0}
        onConnect={props.onConnect}
        onDisconnect={props.onDisconnect}
        onEnsureHelper={props.onEnsureHelper}
        onGoProfiles={props.onGoProfiles}
      />

      {showAnnounce && announce && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-foreground">
          <p className="min-w-0 flex-1">{announce}</p>
          <button
            type="button"
            className="shrink-0 rounded p-0.5 hover:bg-muted"
            aria-label="Dismiss announcement"
            onClick={() => setDismissedAnnounce(announce)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {(primaryGroup || sub) && (
        <div
          className={`grid gap-3 ${
            primaryGroup && sub ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {primaryGroup && (
            <ActiveServerCard
              group={primaryGroup}
              latencies={props.latencies[primaryGroup.name] || {}}
              busy={props.busy}
              onSelect={props.onSelectServer}
            />
          )}
          {sub && (
            <SubscriptionCard info={sub} lastUpdateTime={props.activeProfile?.updatedAt ?? 0} />
          )}
        </div>
      )}

      <TrafficStrip traffic={props.traffic} status={props.status} />
    </div>
  )
}
