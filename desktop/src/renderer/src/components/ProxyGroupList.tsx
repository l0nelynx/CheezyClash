import { useI18n } from '../lib/i18n'
import { ServerRows } from './ServerRows'
import { Input } from './ui/input'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Activity, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import type { ProxyGroupInfo } from '../../../shared/types'
import { isSelectorGroup } from '../lib/proxy-groups'
import { Button } from './ui/button'
import { GroupLayoutPicker, ServerLayoutPicker } from './ProxyLayoutPicker'
import { readLayout, saveLayout, type GroupLayout, type ServerLayout } from '../lib/proxy-layout'
import { useHorizontalScroll } from '../hooks/useHorizontalScroll'

const views = new Map<string, { expanded: string[]; query: string; sort: string; selectedGroup: string | null }>()

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
  groups, profileId, loading, error, onRetry, latencies, busy, running,
  testingAll, testProgress, onSelect, onHealth, onHealthAll,
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const key = profileId ?? ''
  const saved = views.get(key)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(saved?.expanded ?? []))
  const [query, setQuery] = useState(saved?.query ?? '')
  const [sort, setSort] = useState(saved?.sort ?? 'profile')
  const [selectedGroup, setSelectedGroup] = useState<string | null>(saved?.selectedGroup ?? null)
  const [groupLayout, setGroupLayout] = useState<GroupLayout>(() => readLayout('cheezy-group-layout', ['list', 'grid', 'carousel'], 'list'))
  const [serverLayout, setServerLayout] = useState<ServerLayout>(() => readLayout('cheezy-server-layout', ['list', 'large-grid', 'small-grid'], 'list'))
  const tabsRef = useRef<HTMLDivElement>(null)
  const selectedTabRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { views.set(key, { expanded: [...expanded], query, sort, selectedGroup }) }, [key, expanded, query, sort, selectedGroup])
  useEffect(() => { saveLayout('cheezy-group-layout', groupLayout) }, [groupLayout])
  useEffect(() => { saveLayout('cheezy-server-layout', serverLayout) }, [serverLayout])

  const prepared = groups.map((group) => {
    const delays = latencies[group.name] ?? {}
    const names = group.all.filter(name => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    if (sort === 'name') names.sort((a, b) => a.localeCompare(b))
    if (sort === 'latency') {
      const rank = (name: string): number => delays[name] > 0 ? delays[name] : Number.MAX_SAFE_INTEGER
      names.sort((a, b) => rank(a) - rank(b))
    }
    return { group, names, delays }
  }).filter(({ names }) => !query.trim() || names.length > 0)
  const active = prepared.find(({ group }) => group.name === selectedGroup) ?? prepared[0]
  const activeName = active?.group.name
  const draggingTabs = useHorizontalScroll(tabsRef, groupLayout === 'carousel' && running && !error && prepared.length > 0)

  useLayoutEffect(() => {
    const container = tabsRef.current
    if (!container || groupLayout !== 'carousel') return
    const align = (): void => {
      const tab = selectedTabRef.current
      if (!tab) return
      const bounds = container.getBoundingClientRect()
      const item = tab.getBoundingClientRect()
      const delta = item.left + item.width / 2 - bounds.left - container.clientWidth / 2
      // Move the chosen tab towards the middle when it is to the right, or hidden on the left.
      if (delta > 1 || item.left < bounds.left) {
        container.scrollBy({ left: delta, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
      }
    }
    align()
    const observer = new ResizeObserver(align)
    observer.observe(container)
    return () => observer.disconnect()
  }, [activeName, groupLayout, query, prepared.length, running, error])

  function toggle(name: string): void {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function testButton(group: ProxyGroupInfo): React.JSX.Element {
    return <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={busy || testingAll} onClick={() => onHealth(group.name)}>
      <Activity className="h-3.5 w-3.5" />{t("Test")}
    </Button>
  }

  function servers(item: (typeof prepared)[number], carousel = false): React.JSX.Element {
    const { group, names, delays } = item
    return <ServerRows key={`${group.name}:${query}:${sort}:${serverLayout}`} layout={serverLayout}
      names={names} selected={group.now} delays={delays} metadata={group.members}
      maxHeight={carousel ? 480 : undefined}
      disabled={busy || !!testingAll || !isSelectorGroup(group.type)} onSelect={name => onSelect(group.name, name)} />
  }

  let content: React.ReactNode
  if (!running) content = <EmptyState>{t("Connect first to see your servers.")}</EmptyState>
  else if (error) content = <div role="alert" className="space-y-3 p-6 text-center"><p>{t(error)}</p><Button onClick={onRetry}>{t("Try again")}</Button></div>
  else if (loading && groups.length === 0) content = <p role="status" className="p-6 text-center text-muted-foreground">{t("Loading servers…")}</p>
  else if (!groups.length) content = <EmptyState>{t("No server groups in this profile.")}</EmptyState>
  else if (!prepared.length) content = <p role="status" className="py-8 text-center text-sm text-muted-foreground">{t("No matching servers.")}</p>
  else if (groupLayout === 'carousel' && active) {
    content = (
      <section data-group-layout="carousel" className="page-card overflow-hidden">
        <div ref={tabsRef} role="tablist" aria-label={t("Proxy groups")} className={`flex select-none overflow-x-auto border-b border-border ${draggingTabs ? 'cursor-grabbing' : 'cursor-grab'}`}>
          {prepared.map(({ group }, index) => {
            const selected = group.name === activeName
            return <button key={group.name} ref={selected ? selectedTabRef : undefined}
              id={`proxy-group-tab-${index}`} role="tab" type="button" aria-selected={selected}
              aria-controls="proxy-group-panel" tabIndex={selected ? 0 : -1}
              onClick={() => setSelectedGroup(group.name)}
              onKeyDown={event => {
                const target = event.key === 'Home' ? 0 : event.key === 'End' ? prepared.length - 1
                  : event.key === 'ArrowRight' ? (index + 1) % prepared.length
                  : event.key === 'ArrowLeft' ? (index - 1 + prepared.length) % prepared.length : null
                if (target === null) return
                event.preventDefault()
                setSelectedGroup(prepared[target].group.name)
                tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[target]?.focus({ preventScroll: true })
              }}
              title={group.name}
              className={`flex min-w-32 max-w-64 shrink-0 cursor-inherit items-center justify-center gap-2 border-b-2 px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring ${selected ? 'border-primary bg-accent/60 font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground'}`}>
              <GroupIcon url={group.icon} /><span className="truncate font-emoji">{group.name}</span>
            </button>
          })}
        </div>
        <div id="proxy-group-panel" role="tabpanel" aria-labelledby={`proxy-group-tab-${prepared.indexOf(active)}`}>
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <p className="min-w-0 truncate text-xs text-muted-foreground font-emoji" title={active.group.now}>{active.group.now || '—'}</p>
            {testButton(active.group)}
          </div>
          {servers(active, true)}
        </div>
      </section>
    )
  } else {
    content = <div data-group-layout={groupLayout} className={groupLayout === 'grid' ? 'grid items-start gap-3 sm:grid-cols-2' : 'space-y-3'}>
      {prepared.map(item => {
        const { group } = item
        const open = expanded.has(group.name)
        return <section key={group.name} className="page-card min-w-0 overflow-hidden">
          <div className="flex items-center gap-1 border-b border-surface-border px-2 py-1.5">
            <button type="button" aria-expanded={open} onClick={() => toggle(group.name)}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              {open ? <ChevronDown className="h-4 w-4 shrink-0 text-ink-dim" /> : <ChevronRight className="h-4 w-4 shrink-0 text-ink-dim" />}
              <GroupIcon url={group.icon} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-ink font-emoji" title={group.name}>{group.name}</h3>
                <p className="truncate text-xs text-ink-dim font-emoji" title={group.now || undefined}>{group.now || '—'}</p>
              </div>
            </button>
            {testButton(group)}
          </div>
          {open && servers(item)}
        </section>
      })}
    </div>
  }

  return <div className="space-y-3">
    <div data-testid="proxies-toolbar" className="flex items-center gap-2">
      <h2 className="mr-1 shrink-0 text-lg font-semibold text-ink">{t("Proxies")}</h2>
      <Input aria-label={t("Search servers")} placeholder={t("Search servers")} className="h-8 min-w-0 flex-1 text-xs" value={query} onChange={event => {
        const value = event.target.value
        setQuery(value)
        if (value.trim()) setExpanded(new Set(groups.filter(group => group.all.some(name => name.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()))).map(group => group.name)))
      }} />
      <select aria-label={t("Sort servers")} className="h-8 max-w-40 shrink-0 rounded-md border border-border bg-card px-2 text-xs" value={sort} onChange={event => setSort(event.target.value)}>
        <option value="profile">{t("Profile order")}</option><option value="latency">{t("Lowest latency")}</option><option value="name">{t("Name")}</option>
      </select>
      <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={!running || busy || testingAll || !groups.length} onClick={onHealthAll}>
        <Activity className="h-3.5 w-3.5" />
        {testingAll && testProgress ? t("Testing {0}/{1}", {0:testProgress.done,1:testProgress.total}) : t("Test all")}
      </Button>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <GroupLayoutPicker value={groupLayout} onChange={setGroupLayout} />
        {groupLayout !== 'carousel' && <div role="group" aria-label={t("Group expansion")} className="flex gap-1 border-l border-border pl-3">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title={t("Expand all groups")} aria-label={t("Expand all groups")} disabled={!running || !prepared.length} onClick={() => setExpanded(new Set(groups.map(group => group.name)))}><ChevronsUpDown /></Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title={t("Collapse all groups")} aria-label={t("Collapse all groups")} disabled={!running || !prepared.length} onClick={() => setExpanded(new Set())}><ChevronsDownUp /></Button>
        </div>}
      </div>
      <ServerLayoutPicker value={serverLayout} onChange={setServerLayout} />
    </div>
    {content}
  </div>
}

function EmptyState({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="rounded-xl border border-dashed border-surface-border bg-surface-raised/50 px-6 py-12 text-center text-sm text-muted-foreground">{children}</div>
}

function GroupIcon({ url }: { url?: string }): React.JSX.Element | null {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])
  if (!url || failed) return null
  return <img src={url} alt="" draggable={false} className="h-5 w-5 shrink-0 object-contain" onError={() => setFailed(true)} />
}
