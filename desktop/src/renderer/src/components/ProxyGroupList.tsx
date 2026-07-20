import { useState } from 'react'
import { Activity, Check, ChevronDown, ChevronRight } from 'lucide-react'
import type { ProxyGroupInfo } from '../../../shared/types'
import { isSelectorGroup } from '../lib/proxy-groups'

interface Props {
  groups: ProxyGroupInfo[]
  latencies: Record<string, Record<string, number>>
  busy: boolean
  running: boolean
  testingAll?: boolean
  testProgress?: { done: number; total: number } | null
  onSelect: (group: string, name: string) => void
  onHealth: (group: string) => void
  onHealthAll: () => void
}

export function ProxyGroupList({
  groups,
  latencies,
  busy,
  running,
  testingAll,
  testProgress,
  onSelect,
  onHealth,
  onHealthAll,
}: Props): React.JSX.Element {
  // All groups collapsed by default; each toggles independently.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  function toggle(name: string): void {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  if (!running) {
    return (
      <div className="rounded-xl border border-dashed border-surface-border bg-surface-raised/50 px-6 py-12 text-center">
        <p className="text-sm text-ink-muted">Connect first to see your servers.</p>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-surface-border bg-surface-raised/50 px-6 py-12 text-center">
        <p className="text-sm text-ink-muted">No server groups in this profile.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className="btn px-2.5 py-1.5 text-xs"
          disabled={busy || testingAll || groups.length === 0}
          onClick={onHealthAll}
        >
          <Activity className="h-3.5 w-3.5" />
          {testingAll && testProgress
            ? `Testing ${testProgress.done}/${testProgress.total}`
            : 'Test all'}
        </button>
      </div>

      {groups.map((g) => {
        const open = expanded.has(g.name)
        const selectable = isSelectorGroup(g.type)
        const delays = latencies[g.name] || {}
        return (
          <section
            key={g.name}
            className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised"
          >
            <div className="flex items-center gap-1 border-b border-surface-border px-2 py-1.5">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-surface-overlay"
                onClick={() => toggle(g.name)}
                aria-expanded={open}
              >
                {open ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-ink-dim" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-dim" />
                )}
                <GroupIcon url={g.icon} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-ink font-emoji" title={g.name}>
                    {g.name}
                  </h3>
                  <p className="truncate text-xs text-ink-dim font-emoji" title={g.now || undefined}>
                    {g.now || '—'}
                  </p>
                </div>
              </button>
              <button
                type="button"
                className="btn shrink-0 px-2.5 py-1.5 text-xs"
                disabled={busy || testingAll}
                onClick={() => onHealth(g.name)}
              >
                <Activity className="h-3.5 w-3.5" />
                Test
              </button>
            </div>
            {open && (
              <ul className="max-h-64 overflow-y-auto p-2">
                {g.all.map((name) => {
                  const active = name === g.now
                  const ms = delays[name]
                  return (
                    <li key={name}>
                      <button
                        type="button"
                        disabled={busy || testingAll || !selectable}
                        onClick={() => onSelect(g.name, name)}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                          active
                            ? 'bg-accent-soft text-accent'
                            : 'text-ink hover:bg-surface-overlay'
                        }`}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                            active
                              ? 'border-accent bg-accent text-[#1a1408]'
                              : 'border-surface-border'
                          }`}
                        >
                          {active && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium font-emoji" title={name}>
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
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

function GroupIcon({ url }: { url?: string }): React.JSX.Element | null {
  const [failed, setFailed] = useState(false)
  if (!url || failed) return null
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      className="h-5 w-5 shrink-0 object-contain"
      onError={() => setFailed(true)}
    />
  )
}

