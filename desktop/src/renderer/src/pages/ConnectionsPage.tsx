import { Fragment, useState } from 'react'
import { Activity, ArrowDown, ArrowUp, ChevronRight, Clock3, Search, Unplug, X } from 'lucide-react'
import { useConnections } from '../hooks/useConnections'
import { useI18n } from '../lib/i18n'
import { connectionDuration, connectionProcess, connectionRoute, matchesConnection, type LiveConnection } from '../lib/connections'
import { formatBytes, formatRate } from '../lib/format'
import { Button } from '../components/ui/button'

function Rate({ down, up }: { down: number | null; up: number | null }): React.JSX.Element {
  const { t } = useI18n()
  return <div className="space-y-1 whitespace-nowrap text-xs tabular-nums">
    <div className="flex items-center gap-1.5" title={t('Download speed')}>
      <ArrowDown className="h-3 w-3 shrink-0 text-sky-500 dark:text-sky-400" />{down === null ? '—' : formatRate(down)}
    </div>
    <div className="flex items-center gap-1.5 text-muted-foreground" title={t('Upload speed')}>
      <ArrowUp className="h-3 w-3 shrink-0" />{up === null ? '—' : formatRate(up)}
    </div>
  </div>
}

function ConnectionRow({ connection, now, grouped }: { connection: LiveConnection; now: number; grouped: boolean }): React.JSX.Element {
  const { t, language } = useI18n()
  const m = connection.metadata
  const route = connectionRoute(connection)
  const host = m.host || m.destinationIP || t('Unknown destination')
  const ip = m.destinationIP?.includes(':') ? `[${m.destinationIP}]` : m.destinationIP
  const address = [ip, m.destinationPort].filter(Boolean).join(':')
  return <tr data-connection-id={connection.id} className="border-t border-border/60 align-top hover:bg-muted/25">
    <td className="px-4 py-3.5">
      <div className="truncate text-[13px] font-medium" title={host}>{host}</div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="truncate" title={address}>{address || '—'}</span>
        <span className="shrink-0 rounded border border-border px-1 py-0.5 text-[9px] leading-3">{m.network?.toUpperCase() || '—'}</span>
      </div>
      {!grouped && <div className="mt-1 truncate text-[11px] text-muted-foreground" title={m.processPath || m.process}>{connectionProcess(connection) || t('Unknown process')}</div>}
    </td>
    <td className="px-3 py-3.5">
      <div className="break-words text-xs font-medium">{connection.rule || '—'}</div>
      <div className="mt-1 break-words text-xs text-muted-foreground" title={connection.rulePayload}>{connection.rulePayload || t('All traffic')}</div>
    </td>
    <td className="px-3 py-3.5">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5" aria-label={route.join(' → ')}>
        {route.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : route.map((hop, index) => <Fragment key={`${index}-${hop}`}>
          {index > 0 && <ChevronRight aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />}
          <span title={hop} className={`max-w-full break-words rounded-md px-2 py-1 text-[11px] leading-4 ${index === route.length - 1
            ? hop === 'DIRECT' ? 'bg-ok/10 text-ok' : 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
            : 'border border-border text-muted-foreground'}`}>{hop}</span>
        </Fragment>)}
      </div>
    </td>
    <td className="px-3 py-3.5" title={`${t('Downloaded')}: ${formatBytes(connection.download)}\n${t('Uploaded')}: ${formatBytes(connection.upload)}`}>
      <Rate down={connection.downRate} up={connection.upRate} />
    </td>
    <td className="px-3 py-3.5 text-right text-xs tabular-nums" title={t('Started: {0}', { 0: new Date(connection.start).toLocaleString(language) })}>
      {connectionDuration(connection.start, now)}
    </td>
  </tr>
}

function initialGrouping(): boolean {
  try { return localStorage.getItem('cheezy-connections-grouping') === 'process' } catch { return false }
}

export function ConnectionsPage({ running }: { running: boolean }): React.JSX.Element {
  const { t } = useI18n()
  const { connections, loading, failed, updatedAt, retry } = useConnections(running)
  const [grouped, setGrouped] = useState(initialGrouping)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const visible = connections.filter(connection => matchesConnection(connection, search)).sort((a, b) =>
    sort === 'traffic'
      ? ((b.downRate ?? 0) + (b.upRate ?? 0)) - ((a.downRate ?? 0) + (a.upRate ?? 0)) || a.id.localeCompare(b.id)
      : Date.parse(b.start) - Date.parse(a.start) || a.id.localeCompare(b.id))
  const groups = new Map<string, LiveConnection[]>()
  for (const connection of visible) {
    const name = grouped ? connectionProcess(connection) : ''
    const group = groups.get(name) ?? []
    group.push(connection)
    groups.set(name, group)
  }
  const sections = grouped ? [...groups].sort(([a], [b]) => a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)) : [...groups]
  const down = connections.reduce((total, connection) => total + (connection.downRate ?? 0), 0)
  const up = connections.reduce((total, connection) => total + (connection.upRate ?? 0), 0)
  const hasRates = connections.some(connection => connection.downRate !== null)
  const chooseGrouping = (value: string): void => {
    setGrouped(value === 'process')
    try { localStorage.setItem('cheezy-connections-grouping', value) } catch { /* Session-only preference. */ }
  }

  return <div className="mx-auto max-w-7xl space-y-4" data-testid="connections-page">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">{t('Connections')}
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{connections.length}</span>
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{t('Live traffic, matched rules and proxy routes.')}</p>
      </div>
      <div className="flex items-center gap-5 pt-1 text-xs tabular-nums">
        <span className="flex items-center gap-1.5" title={t('Download speed')}><ArrowDown className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400" />{hasRates ? formatRate(down) : '—'}</span>
        <span className="flex items-center gap-1.5 text-muted-foreground" title={t('Upload speed')}><ArrowUp className="h-3.5 w-3.5" />{hasRates ? formatRate(up) : '—'}</span>
        <span className="flex items-center gap-1.5 text-muted-foreground" role="status"><span className={`h-1.5 w-1.5 rounded-full ${running && !failed ? 'bg-ok' : 'bg-muted-foreground'}`} />{t(!running ? 'Disconnected' : failed ? 'Reconnecting…' : 'Live')}</span>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-44 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input className="field h-9 pl-9 pr-9 text-xs" aria-label={t('Search connections')} placeholder={t('Search host, process, rule or proxy…')} value={search} onChange={event => setSearch(event.target.value)} />
        {search && <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring" aria-label={t('Clear search')} onClick={() => setSearch('')}><X className="h-3.5 w-3.5" /></button>}
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">{t('Group by')}
        <select className="field h-9 w-auto py-1 text-xs text-foreground" aria-label={t('Group connections')} value={grouped ? 'process' : 'none'} onChange={event => chooseGrouping(event.target.value)}>
          <option value="none">{t('No grouping')}</option><option value="process">process-name</option>
        </select>
      </label>
      <select className="field h-9 w-auto py-1 text-xs" aria-label={t('Sort connections')} value={sort} onChange={event => setSort(event.target.value)}>
        <option value="newest">{t('Newest first')}</option><option value="traffic">{t('Highest speed')}</option>
      </select>
    </div>

    {!running || loading || failed || connections.length === 0 || visible.length === 0 ? <div className="page-card flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
      {!running ? <Unplug className="h-7 w-7 text-muted-foreground" /> : <Activity className="h-7 w-7 text-muted-foreground" />}
      <p className="text-sm font-medium" role={failed ? 'alert' : 'status'}>{t(!running ? 'Connect to see active connections' : loading ? 'Loading connections…' : failed ? 'Could not load connections' : connections.length === 0 ? 'No active connections' : 'No matching connections')}</p>
      <p className="max-w-md text-xs text-muted-foreground">{t(!running ? 'Start the connection on the Home tab.' : failed ? 'Check the core connection. Retrying automatically.' : loading ? 'Waiting for the controller.' : connections.length === 0 ? 'Open a website or an app. New connections will appear here automatically.' : 'Try another host, process, rule or proxy name.')}</p>
      {failed && <Button variant="outline" size="sm" onClick={retry}>{t('Try again')}</Button>}
      {search && !failed && <Button variant="outline" size="sm" onClick={() => setSearch('')}>{t('Clear search')}</Button>}
    </div> : <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed text-left" aria-label={t('Active connections')}>
          <colgroup><col className="w-[26%]" /><col className="w-[17%]" /><col className="w-[28%]" /><col className="w-[18%]" /><col className="w-[11%]" /></colgroup>
          <thead className="bg-muted/35 text-[11px] font-medium text-muted-foreground"><tr>
            <th scope="col" className="px-4 py-3 font-medium">{t(grouped ? 'Destination' : 'Destination / Process')}</th>
            <th scope="col" className="px-3 py-3 font-medium">{t('Matched rule')}</th>
            <th scope="col" className="px-3 py-3 font-medium">{t('Proxy chain')}</th>
            <th scope="col" className="px-3 py-3 font-medium">{t('Speed')} <span className="font-normal">↓ / ↑</span></th>
            <th scope="col" className="px-3 py-3 text-right font-medium"><span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{t('Duration')}</span></th>
          </tr></thead>
          {sections.map(([name, rows]) => <tbody key={name}>
            {grouped && <tr className="border-t border-border bg-muted/30"><th scope="rowgroup" colSpan={5} className="p-0 font-normal">
              <button className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring" aria-expanded={!collapsed.has(name)} onClick={() => setCollapsed(previous => {
                const next = new Set(previous)
                if (next.has(name)) next.delete(name); else next.add(name)
                return next
              })}>
                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground ${collapsed.has(name) ? '' : 'rotate-90'}`} />
                <span className="font-semibold">{name || t('Unknown process')}</span>
                <span className="rounded bg-background/70 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">{rows.length}</span>
                <span className="ml-auto flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground"><ArrowDown className="h-3 w-3" />{rows.some(row => row.downRate !== null) ? formatRate(rows.reduce((total, row) => total + (row.downRate ?? 0), 0)) : '—'}</span>
              </button>
            </th></tr>}
            {(!grouped || !collapsed.has(name)) && rows.map(connection => <ConnectionRow key={connection.id} connection={connection} now={updatedAt} grouped={grouped} />)}
          </tbody>)}
        </table>
      </div>
      <div className="flex flex-wrap justify-between gap-2 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
        <span>{t('Showing {0} of {1}', { 0: visible.length, 1: connections.length })}</span>
        <span>{t('Updates every second')} · {t('Route: category → proxy')}</span>
      </div>
    </div>}
    {running && !failed && !loading && connections.some(connection => !connectionProcess(connection)) && <p className="text-[11px] text-muted-foreground">{t('Some connections have no process-name. Process detection depends on the core, connection mode and permissions.')}</p>}
  </div>
}
