import { useState } from 'react'
import { Check } from 'lucide-react'

export function ServerRows({ names, selected, delays, disabled, onSelect }: {
  names: string[]; selected: string; delays: Record<string, number>; disabled: boolean; onSelect: (name: string) => void
}): React.JSX.Element {
  const [scrollTop, setScrollTop] = useState(0)
  const height = 40
  const start = Math.max(0, Math.min(names.length - 1, Math.floor(scrollTop / height)) - 6)
  const end = Math.min(names.length, start + 20)
  return <ul aria-label="Servers" className="overflow-y-auto px-2" style={{ height: Math.min(256, names.length * height) }}
    onScroll={event => setScrollTop(event.currentTarget.scrollTop)}>
    <li aria-hidden="true" style={{ height: start * height }} />
    {names.slice(start, end).map(name => {
      const active = selected === name
      const ms = delays[name]
      return <li key={name} style={{ height }}>
        <button type="button" disabled={disabled} aria-pressed={active} onClick={() => onSelect(name)}
          className={`flex h-full w-full items-center gap-2 rounded-lg px-3 text-left text-sm focus-visible:ring-1 focus-visible:ring-ring ${active ? 'bg-primary/10 text-primary' : 'text-ink hover:bg-surface-overlay'}`}>
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-surface-border'}`}>
            {active && <Check className="h-3 w-3" />}
          </span>
          <span className="min-w-0 flex-1 truncate font-emoji" title={name}>{name}</span>
          {ms !== undefined && <span className={`shrink-0 text-xs tabular-nums ${ms < 0 ? 'text-danger' : ms < 200 ? 'text-ok' : 'text-muted-foreground'}`}>
            {ms < 0 ? 'fail' : `${ms} ms`}
          </span>}
        </button>
      </li>
    })}
    <li aria-hidden="true" style={{ height: (names.length - end) * height }} />
  </ul>
}
