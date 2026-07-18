import { ArrowDown, ArrowUp } from 'lucide-react'
import type { CoreStatus, TrafficSnapshot } from '../../../shared/types'
import { formatBytes, formatRate } from '../lib/format'

interface Props {
  traffic: TrafficSnapshot | null
  status: CoreStatus | null
}

export function TrafficStrip({ traffic, status }: Props): React.JSX.Element {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat
        icon={<ArrowUp className="h-4 w-4 text-accent" />}
        label="Upload total"
        value={formatBytes(traffic?.upTotal ?? 0)}
      />
      <Stat
        icon={<ArrowDown className="h-4 w-4 text-ok" />}
        label="Download total"
        value={formatBytes(traffic?.downTotal ?? 0)}
      />
      <Stat label="Controller" value={status?.controller || '—'} muted />
      <Stat
        label="Rates"
        value={`${formatRate(traffic?.up ?? 0)} ↑ · ${formatRate(traffic?.down ?? 0)} ↓`}
        muted
      />
    </section>
  )
}

function Stat({
  label,
  value,
  icon,
  muted,
}: {
  label: string
  value: string
  icon?: React.ReactNode
  muted?: boolean
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised px-4 py-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-ink-dim">
        {icon}
        {label}
      </div>
      <div className={`truncate text-sm font-medium ${muted ? 'text-ink-muted' : 'text-ink'}`}>
        {value}
      </div>
    </div>
  )
}
