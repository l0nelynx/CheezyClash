import type { CoreStatus, ProfileMeta, TrafficSnapshot, TunStatus } from '../../../shared/types'
import { ConnectHero } from '../components/ConnectHero'
import { SubscriptionCard } from '../components/SubscriptionCard'
import { TrafficStrip } from '../components/TrafficStrip'

interface Props {
  status: CoreStatus | null
  tun: TunStatus | null
  traffic: TrafficSnapshot | null
  downRateHistory: number[]
  activeProfile: ProfileMeta | null
  busy: boolean
  onConnect: () => void
  onDisconnect: () => void
  onEnsureHelper: () => void
}

export function HomePage(props: Props): React.JSX.Element {
  const sub = props.activeProfile?.subscription
  const announce = sub?.announce

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <ConnectHero
        status={props.status}
        tun={props.tun}
        busy={props.busy}
        downRateHistory={props.downRateHistory}
        downRate={props.traffic?.down ?? 0}
        onConnect={props.onConnect}
        onDisconnect={props.onDisconnect}
        onEnsureHelper={props.onEnsureHelper}
      />

      {announce && (
        <div className="rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent">
          {announce}
        </div>
      )}

      {sub && (
        <SubscriptionCard info={sub} lastUpdateTime={props.activeProfile?.updatedAt ?? 0} />
      )}

      <TrafficStrip traffic={props.traffic} status={props.status} />
    </div>
  )
}
