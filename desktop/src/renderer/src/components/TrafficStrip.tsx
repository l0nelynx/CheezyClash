import { ArrowDown, ArrowUp } from 'lucide-react'
import type { CoreStatus, TrafficSnapshot } from '../../../shared/types'
import { formatBytes, formatRate } from '../lib/format'

interface Props {
  traffic: TrafficSnapshot | null
  status: CoreStatus | null
}

export function TrafficStrip({ traffic, status }: Props): React.JSX.Element | null {
  if (!status?.running) return null

  const upTotal = formatBytes(traffic?.upTotal ?? 0)
  const downTotal = formatBytes(traffic?.downTotal ?? 0)
  const rates = `${formatRate(traffic?.up ?? 0)} ↑ · ${formatRate(traffic?.down ?? 0)} ↓`

  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Stat
        icon={<ArrowUp className="h-4 w-4 text-accent" />}
        label="Upload total"
        value={upTotal}
        title={upTotal}
      />
      <Stat
        icon={<ArrowDown className="h-4 w-4 text-ok" />}
        label="Download total"
        value={downTotal}
        title={downTotal}
      />
      <Stat label="Rates" value={rates} title={rates} muted className="col-span-2 sm:col-span-1" />
    </section>
  )
}

function Stat({
  label,
  value,
  icon,
  muted,
  title,
  className = '',
}: {
  label: string
  value: string
  icon?: React.ReactNode
  muted?: boolean
  title?: string
  className?: string
}): React.JSX.Element {
  return (
    <div className={`rounded-xl border border-surface-border bg-surface-raised px-4 py-3 ${className}`}>
      <div className="mb-1 flex items-center gap-1.5 text-xs text-ink-dim">
        {icon}
        {label}
      </div>
      <div
        className={`truncate text-sm font-medium ${muted ? 'text-ink-muted' : 'text-ink'}`}
        title={title ?? value}
      >
        {value}
      </div>
    </div>
  )
}
