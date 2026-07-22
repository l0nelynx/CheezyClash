import { formatBytes } from '../lib/format'
import type { SubscriptionInfo } from '../../../shared/types'

interface Props {
  info: SubscriptionInfo
  lastUpdateTime: number
}

function formatExpire(unix: number): string {
  if (unix <= 0) return '—'
  const d = new Date(unix * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatLastUpdate(millis: number): string {
  if (millis <= 0) return ''
  const d = new Date(millis)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function SubscriptionCard({ info, lastUpdateTime }: Props): React.JSX.Element {
  const used = info.upload + info.download
  const isUnlimited = info.total <= 0
  const remaining = isUnlimited ? 0 : Math.max(0, info.total - used)
  const progress = isUnlimited ? 0 : Math.min(1, Math.max(0, used / info.total))

  const nowSec = Math.floor(Date.now() / 1000)
  const daysLeft = info.expire > 0 ? Math.floor((info.expire - nowSec) / 86400) : -1

  const progressColor =
    isUnlimited ? 'bg-primary' : progress > 0.9 ? 'bg-danger' : progress > 0.75 ? 'bg-muted-foreground' : 'bg-primary'
  const progressText =
    isUnlimited ? 'text-primary' : progress > 0.9 ? 'text-danger' : progress > 0.75 ? 'text-muted-foreground' : 'text-primary'
  const expireColor =
    daysLeft < 0
      ? 'text-muted-foreground'
      : daysLeft < 3
        ? 'text-danger font-semibold'
        : daysLeft < 7
          ? 'text-muted-foreground font-semibold'
          : 'text-muted-foreground'

  return (
    <section className="h-full rounded-xl border border-surface-border bg-surface-raised px-4 py-3">
      {!isUnlimited && (
        <div className="mb-2.5 h-1 overflow-hidden rounded-full bg-surface-overlay">
          <div
            className={`h-full rounded-full transition-all ${progressColor}`}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] text-ink-dim">Used</p>
          <p className={`text-base font-semibold tabular-nums ${progressText}`}>{formatBytes(used)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-ink-dim">{isUnlimited ? 'Limit' : 'Remaining'}</p>
          <p className="text-base font-semibold tabular-nums text-ink">
            {isUnlimited ? 'Unlimited' : formatBytes(remaining)}
          </p>
        </div>
      </div>

      {(info.expire > 0 || lastUpdateTime > 0) && (
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-surface-border/60 pt-2.5">
          {info.expire > 0 ? (
            <p className={`text-[11px] ${expireColor}`}>Expires {formatExpire(info.expire)}</p>
          ) : (
            <span />
          )}
          {lastUpdateTime > 0 && (
            <p className="text-right text-[10px] text-ink-dim">{formatLastUpdate(lastUpdateTime)}</p>
          )}
        </div>
      )}
    </section>
  )
}
