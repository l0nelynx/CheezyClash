import { ServerRows } from './ServerRows'
import { Input } from './ui/input'
import { useEffect, useState } from 'react'
import { Activity, ChevronDown, ChevronRight } from 'lucide-react'
import type { ProxyGroupInfo } from '../../../shared/types'
import { isSelectorGroup } from '../lib/proxy-groups'
import { Button } from './ui/button'

const views = new Map<string, { expanded: string[]; query: string; sort: string }>()

interface Props {
  loading: boolean
  error: string | null
  onRetry: () => void
  profileId: string | null
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
  profileId,
  loading,
  error,
  onRetry,
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
  const key = profileId ?? ''
  const saved = views.get(key)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(saved?.expanded ?? []))
  const [query, setQuery] = useState(saved?.query ?? '')
  const [sort, setSort] = useState(saved?.sort ?? 'profile')
  useEffect(() => { views.set(key, { expanded: [...expanded], query, sort }) }, [key, expanded, query, sort])

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
        <p className="text-sm text-muted-foreground">Connect first to see your servers.</p>
      </div>
    )
  }

  if (error) return <div role="alert" className="space-y-3 p-6 text-center"><p>{error}</p><Button onClick={onRetry}>Try again</Button></div>
  if (loading && groups.length === 0) return <p role="status" className="p-6 text-center text-muted-foreground">Loading servers…</p>
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-surface-border bg-surface-raised/50 px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">No server groups in this profile.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Search servers" placeholder="Search servers" className="min-w-40 flex-1" value={query} onChange={event => setQuery(event.target.value)} />
        <select aria-label="Sort servers" className="rounded-md border border-border bg-card px-3 py-2 text-sm" value={sort} onChange={event => setSort(event.target.value)}>
          <option value="profile">Profile order</option><option value="latency">Lowest latency</option><option value="name">Name</option>
        </select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || testingAll || groups.length === 0}
          onClick={onHealthAll}
        >
          <Activity className="h-3.5 w-3.5" />
          {testingAll && testProgress
            ? `Testing ${testProgress.done}/${testProgress.total}`
            : 'Test all'}
        </Button>
      </div>

      {query.trim() && !groups.some(g => g.all.some(name => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))) && <p role="status" className="py-8 text-center text-sm text-muted-foreground">No matching servers.</p>}
      {groups.map((g) => {
        const open = expanded.has(g.name) || !!query.trim()
        const selectable = isSelectorGroup(g.type)
        const delays = latencies[g.name] || {}
        const names = g.all.filter(name => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
        if (sort === 'name') names.sort((a, b) => a.localeCompare(b))
        if (sort === 'latency') {
          const rank = (name: string): number => delays[name] > 0 ? delays[name] : Number.MAX_SAFE_INTEGER
          names.sort((a, b) => rank(a) - rank(b))
        }
        if (query.trim() && !names.length) return null
        return (
          <section
            key={g.name}
            className="page-card overflow-hidden"
          >
            <div className="flex items-center gap-1 border-b border-surface-border px-2 py-1.5">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={busy || testingAll}
                onClick={() => onHealth(g.name)}
              >
                <Activity className="h-3.5 w-3.5" />
                Test
              </Button>
            </div>
            {open && <ServerRows key={`${query}:${sort}`} names={names} selected={g.now} delays={delays}
              disabled={busy || !!testingAll || !selectable} onSelect={name => onSelect(g.name, name)} />}
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

