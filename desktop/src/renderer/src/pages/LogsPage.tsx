import { useEffect, useRef, useState } from 'react'

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
  const endRef = useRef<HTMLDivElement>(null)
  const visible = logs.slice(-300)

  useEffect(() => {
    if (autoScroll) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visible.length, autoScroll])

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Logs</h2>
          <p className="text-sm text-muted-foreground">Recent activity.</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="accent-accent"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
          />
          Auto-scroll
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-surface-border bg-surface-sunken p-4 font-mono text-xs leading-relaxed">
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
        <div ref={endRef} />
      </div>
    </div>
  )
}
