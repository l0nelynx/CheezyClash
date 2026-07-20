import { ArrowDown, ArrowUp } from 'lucide-react'
import type { CoreStatus, TrafficSnapshot } from '../../../shared/types'
import { formatBytes } from '../lib/format'

interface Props {
  traffic: TrafficSnapshot | null
  status: CoreStatus | null
}

/** Single session totals card (rates live in ConnectHero). */
export function TrafficStrip({ traffic, status }: Props): React.JSX.Element | null {
  if (!status?.running) return null

  const upTotal = formatBytes(traffic?.upTotal ?? 0)
  const downTotal = formatBytes(traffic?.downTotal ?? 0)

  return (
    <section className="rounded-xl border border-surface-border bg-surface-raised px-4 py-3">
      <p className="mb-2 text-xs text-ink-dim">Session</p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm font-medium text-ink">
        <span className="inline-flex items-center gap-1.5 tabular-nums" title={upTotal}>
          <ArrowUp className="h-3.5 w-3.5 text-accent" aria-hidden />
          {upTotal}
        </span>
        <span className="inline-flex items-center gap-1.5 tabular-nums" title={downTotal}>
          <ArrowDown className="h-3.5 w-3.5 text-ok" aria-hidden />
          {downTotal}
        </span>
      </div>
    </section>
  )
}
