import { useI18n } from '../lib/i18n'
import { useLayoutEffect, useRef, useState } from 'react'
import { Switch } from '../components/ui/switch'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { redactLog } from '../lib/privacy'

interface Props {
  logs: string[]
}

function lineClass(line: string): string {
  const lower = line.toLowerCase()
  if (lower.includes('error') || lower.includes('fail')) return 'text-danger'
  if (lower.includes('warn')) return 'text-muted-foreground'
  return 'text-muted-foreground'
}

export function LogsPage({ logs }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [autoScroll, setAutoScroll] = useState(true)
  const [pausedLogs, setPausedLogs] = useState(logs)
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('all')
  const scrollRef = useRef<HTMLDivElement>(null)
  const visible = (autoScroll ? logs : pausedLogs).slice(-300).map(redactLog).filter(line =>
    line.toLowerCase().includes(query.toLowerCase()) && (level === 'all' || line.toLowerCase().includes(`[${level}]`)),
  )

  useLayoutEffect(() => {
    if (autoScroll && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [logs, autoScroll, query, level])

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">{t("Logs")}</h2>
          <p className="text-sm text-muted-foreground">{t("Recent activity.")}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={autoScroll}
            onCheckedChange={(enabled) => { setPausedLogs(logs); setAutoScroll(enabled) }}
          />
          {t("Auto-scroll")}</label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="min-w-40 flex-1" aria-label={t("Search logs")} placeholder={t("Search logs")} value={query} onChange={event => setQuery(event.target.value)} />
        <select aria-label={t("Log level")} className="rounded-md border border-border bg-card px-3 py-2 text-sm" value={level} onChange={event => setLevel(event.target.value)}>
          <option value="all">{t("All levels")}</option><option value="error">{t("Errors")}</option><option value="warn">{t("Warnings")}</option><option value="info">{t("Info")}</option>
        </select>
        <Button variant="outline" disabled={!visible.length} onClick={() => {
          const url = URL.createObjectURL(new Blob([visible.join('\n')], { type: 'text/plain;charset=utf-8' }))
          const link = document.createElement('a')
          link.href = url; link.download = 'cheezy-logs.txt'; link.click()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }}>{t("Export visible logs")}</Button>
      </div>
      <div ref={scrollRef} onScroll={(event) => {
        const element = event.currentTarget
        if (autoScroll && element.scrollHeight - element.scrollTop - element.clientHeight > 24) {
          setPausedLogs(logs)
          setAutoScroll(false)
        }
      }} className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-surface-sunken p-4 font-mono text-xs leading-relaxed shadow-inner">
        {visible.length === 0 ? (
          <p className="text-ink-dim">{t("No log lines yet.")}</p>
        ) : (
          visible.map((line, i) => (
            <div
              key={`${i}-${line.slice(0, 24)}`}
              className={`whitespace-pre-wrap break-all ${lineClass(line)}`}
            >
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
