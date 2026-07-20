import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronRight, Search } from 'lucide-react'
import type { ProxyGroupInfo } from '../../../shared/types'
import { isSelectorGroup } from '../lib/proxy-groups'

interface Props {
  group: ProxyGroupInfo
  latencies: Record<string, number>
  busy: boolean
  onSelect: (group: string, name: string) => void
}

export function ActiveServerCard({ group, latencies, busy, onSelect }: Props): React.JSX.Element {
  const selectable = isSelectorGroup(group.type)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const showSearch = group.all.length > 12
  const delays = latencies
  const nowDelay = delays[group.now]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return group.all
    return group.all.filter((n) => n.toLowerCase().includes(q))
  }, [group.all, query])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (open && showSearch) {
      queueMicrotask(() => searchRef.current?.focus())
    }
    if (!open) setQuery('')
  }, [open, showSearch])

  function pick(name: string): void {
    setOpen(false)
    if (name === group.now) return
    onSelect(group.name, name)
  }

  return (
    <div ref={rootRef} className="relative h-full">
      <button
        type="button"
        disabled={busy || !selectable}
        aria-expanded={selectable ? open : undefined}
        aria-haspopup={selectable ? 'listbox' : undefined}
        onClick={() => {
          if (selectable) setOpen((v) => !v)
        }}
        className={`flex h-full w-full flex-col rounded-xl border border-surface-border bg-surface-raised px-4 py-3 text-left transition ${
          selectable
            ? 'hover:bg-surface-overlay disabled:cursor-not-allowed disabled:opacity-45'
            : 'cursor-default'
        }`}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="truncate text-[11px] uppercase tracking-wide text-ink-dim font-emoji" title={group.name}>
            {group.name}
          </p>
          {selectable ? (
            <ChevronRight
              className={`h-3.5 w-3.5 shrink-0 text-ink-dim transition ${open ? 'translate-x-0.5' : ''}`}
            />
          ) : (
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-dim">Auto</span>
          )}
        </div>
        <p className="truncate text-sm font-semibold text-ink font-emoji" title={group.now || undefined}>
          {group.now || '—'}
        </p>
        {nowDelay !== undefined && (
          <p
            className={`mt-0.5 text-xs tabular-nums ${
              nowDelay < 0 ? 'text-danger' : nowDelay < 200 ? 'text-ok' : 'text-ink-muted'
            }`}
          >
            {nowDelay < 0 ? 'fail' : `${nowDelay} ms`}
          </p>
        )}
      </button>

      {open && selectable && (
        <div
          role="listbox"
          aria-label={`Servers in ${group.name}`}
          className="absolute left-full top-0 z-40 ml-2 flex w-72 max-h-[min(20rem,calc(100vh-6rem))] flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-raised shadow-lg"
        >
          {showSearch && (
            <div className="flex items-center gap-2 border-b border-surface-border px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-ink-dim" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search servers…"
                className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-dim"
              />
            </div>
          )}
          <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-ink-muted">No matches</li>
            ) : (
              filtered.map((name) => {
                const active = name === group.now
                const ms = delays[name]
                return (
                  <li key={name}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      disabled={busy}
                      onClick={() => pick(name)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                        active
                          ? 'bg-accent-soft text-accent'
                          : 'text-ink hover:bg-surface-overlay'
                      }`}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                        {active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-emoji" title={name}>
                        {name}
                      </span>
                      {ms !== undefined && (
                        <span
                          className={`shrink-0 text-xs tabular-nums ${
                            ms < 0 ? 'text-danger' : ms < 200 ? 'text-ok' : 'text-ink-muted'
                          }`}
                        >
                          {ms < 0 ? 'fail' : `${ms} ms`}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
