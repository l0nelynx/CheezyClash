import { useLayoutEffect, useRef, useState } from 'react'
import { Switch } from '../components/ui/switch'

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
  const [autoScroll, setAutoScroll] = useState(true)
  const [pausedLogs, setPausedLogs] = useState(logs)
  const scrollRef = useRef<HTMLDivElement>(null)
  const visible = (autoScroll ? logs : pausedLogs).slice(-300)

  useLayoutEffect(() => {
    if (autoScroll && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [logs, autoScroll])

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Logs</h2>
          <p className="text-sm text-muted-foreground">Recent activity.</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={autoScroll}
            onCheckedChange={(enabled) => { setPausedLogs(logs); setAutoScroll(enabled) }}
          />
          Auto-scroll
        </label>
      </div>
      <div ref={scrollRef} onScroll={(event) => {
        const element = event.currentTarget
        if (autoScroll && element.scrollHeight - element.scrollTop - element.clientHeight > 24) {
          setPausedLogs(logs)
          setAutoScroll(false)
        }
      }} className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-surface-sunken p-4 font-mono text-xs leading-relaxed shadow-inner">
        {visible.length === 0 ? (
          <p className="text-ink-dim">No log lines yet.</p>
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
