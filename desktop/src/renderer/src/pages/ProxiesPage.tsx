import type { ProxyGroupInfo } from '../../../shared/types'
import { ProxyGroupList } from '../components/ProxyGroupList'

interface Props {
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
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink">Proxies</h2>
        <p className="text-sm text-ink-muted">
          Groups follow core order. Expand a group to pick a server.
        </p>
      </div>
      <ProxyGroupList {...props} />
    </div>
  )
}
