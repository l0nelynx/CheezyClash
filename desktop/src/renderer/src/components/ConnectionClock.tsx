import { useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n'
export function ConnectionClock({
  running,
  connectedAt,
}: {
  running: boolean
  connectedAt?: number
}): React.JSX.Element {
  const { t } = useI18n()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!running || !connectedAt) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running, connectedAt])
  const seconds = Math.max(0, Math.floor((now - (connectedAt ?? now)) / 1000))
  const value = !running
    ? '00:00:00'
    : !connectedAt
      ? '—'
      : [
          Math.floor(seconds / 3600),
          Math.floor(seconds / 60) % 60,
          seconds % 60,
        ]
          .map((n) => String(n).padStart(2, '0'))
          .join(':')
  return (
    <div className="mt-3">
      <p
        className="text-xl font-medium tabular-nums tracking-wide"
        title={
          running && !connectedAt
            ? t('Session start time unavailable')
            : undefined
        }
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{t('Connection time')}</p>
    </div>
  )
}
