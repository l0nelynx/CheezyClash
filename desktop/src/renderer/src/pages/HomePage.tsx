import { useI18n } from '../lib/i18n'
import { useState } from 'react'
import { X, Megaphone } from 'lucide-react'
import type {
  CoreStatus,
  AppSettings,
  ConnectionMode,
  ProfileMeta,
  ProxyGroupInfo,
  TrafficSnapshot,
  TunStatus,
} from '../../../shared/types'
import { ActiveServerCard } from '../components/ActiveServerCard'
import { ConnectHero } from '../components/ConnectHero'
import { SubscriptionCard } from '../components/SubscriptionCard'
import { usePublicIp } from '../hooks/usePublicIp'

interface Props {
  settings: AppSettings | null
  onConnectionMode: (mode: ConnectionMode) => void
  connectionAction: string | null
  status: CoreStatus | null
  tun: TunStatus | null
  traffic: TrafficSnapshot | null
  downRateHistory: number[]
  activeProfile: ProfileMeta | null
  groups: ProxyGroupInfo[]
  latencies: Record<string, Record<string, number>>
  busy: boolean
  customRuleCount: number
  onOpenCustomRules: () => void
  onConnect: () => void
  onDisconnect: () => void
  onEnsureHelper: () => void
  onConnectProxy?: () => void
  onGoProfiles: () => void
  onSelectServer: (group: string, name: string) => void
}

export function HomePage(props: Props): React.JSX.Element {
  const { t } = useI18n()
  const sub = props.activeProfile?.subscription
  const announce = sub?.announce
  const [dismissedAnnounce, setDismissedAnnounce] = useState<string | null>(
    null,
  )
  const announcementKey = JSON.stringify([props.activeProfile?.id, announce])
  const showAnnounce = !!announce && announcementKey !== dismissedAnnounce
  const running = !!props.status?.running
  const primaryGroup = running ? (props.groups[0] ?? null) : null
  const hasProfile = !!props.activeProfile
  const publicIp = usePublicIp(running && !props.busy ? JSON.stringify([
    props.status?.connectedAt, props.status?.mode, props.activeProfile?.id,
    props.groups.map(group => [group.name, group.now]),
  ]) : null)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3">
      <ConnectHero
        settings={props.settings}
        onConnectionMode={props.onConnectionMode}
        status={props.status}
        connectionAction={props.connectionAction}
        tun={props.tun}
        busy={props.busy}
        customRuleCount={props.customRuleCount}
        onOpenCustomRules={props.onOpenCustomRules}
        hasProfile={hasProfile}
        activeProfile={props.activeProfile}
        downRateHistory={props.downRateHistory}
        downRate={props.traffic?.down ?? 0}
        upRate={props.traffic?.up ?? 0}
        onConnect={props.onConnect}
        onDisconnect={props.onDisconnect}
        onEnsureHelper={props.onEnsureHelper}
        onConnectProxy={props.onConnectProxy}
        onGoProfiles={props.onGoProfiles}
      />

      {showAnnounce && announce && (
        <div
          data-testid="announcement"
          role="region"
          aria-label={t('Announcement')}
          className="page-card flex items-start gap-3 px-4 py-3 text-sm text-foreground"
        >
          <Megaphone
            aria-hidden
            className="mt-0.5 h-4 w-4 shrink-0 text-primary"
          />
          <p className="max-h-28 min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words">
            {announce}
          </p>
          <button
            type="button"
            className="shrink-0 rounded p-0.5 hover:bg-muted"
            aria-label={t('Dismiss announcement')}
            onClick={() => setDismissedAnnounce(announcementKey)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <ActiveServerCard
          publicIp={publicIp}
          key={props.activeProfile?.id + ':' + primaryGroup?.name}
          group={primaryGroup}
          latencies={
            primaryGroup ? props.latencies[primaryGroup.name] || {} : {}
          }
          traffic={running ? props.traffic : null}
          busy={props.busy || !!props.status?.readOnly}
          onSelect={props.onSelectServer}
        />
        <SubscriptionCard
          profile={props.activeProfile}
          onGoProfiles={props.onGoProfiles}
        />
      </div>
    </div>
  )
}
