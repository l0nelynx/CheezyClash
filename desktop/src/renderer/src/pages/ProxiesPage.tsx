import { useI18n } from '../lib/i18n'
import type { ProxyGroupInfo } from '../../../shared/types'
import { ProxyGroupList } from '../components/ProxyGroupList'

interface Props {
  loading: boolean
  error: string | null
  onRetry: () => void
  profileId: string | null
  groups: ProxyGroupInfo[]
  latencies: Record<string, Record<string, number>>
  busy: boolean
  running: boolean
  testingAll?: boolean
  testProgress?: { done: number; total: number } | null
  onSelect: (group: string, name: string) => void
  onHealth: (group: string) => void
  onHealthAll: () => void
}

export function ProxiesPage(props: Props): React.JSX.Element {
  const { t } = useI18n()
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink">{t("Proxies")}</h2>
        <p className="text-sm text-muted-foreground">{t("Choose a server in a group.")}</p>
      </div>
      <ProxyGroupList key={props.profileId} {...props} />
    </div>
  )
}
