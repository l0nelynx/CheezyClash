import { useMemo, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronDown, Globe, Search } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { isSelectorGroup } from '../lib/proxy-groups'
import { formatBytes } from '../lib/format'
import type { ProxyGroupInfo, PublicIpSnapshot, TrafficSnapshot } from '../../../shared/types'
interface Props {
  publicIp: PublicIpSnapshot
  group: ProxyGroupInfo | null
  latencies: Record<string, number>
  traffic: TrafficSnapshot | null
  busy: boolean
  onSelect: (group: string, name: string) => void
}
export function ActiveServerCard({
  publicIp,
  group,
  latencies,
  traffic,
  busy,
  onSelect,
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const selectable = !!group && isSelectorGroup(group.type)
  const names = useMemo(
    () =>
      group?.all.filter((name) =>
        name.toLowerCase().includes(query.trim().toLowerCase()),
      ) ?? [],
    [group, query],
  )
  const delay = group ? latencies[group.now] : undefined
  const meta = group?.members?.[group.now]
  const country = publicIp.state === 'ready' ? publicIp.countryCode : undefined
  const flag = country && /^[A-Z]{2}$/.test(country)
    ? String.fromCodePoint(...[...country].map(letter => 0x1f1e6 + letter.charCodeAt(0) - 65))
    : null
  return (
    <section className="page-card min-w-0 p-4" data-testid="vpn-widget">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('Connection')}</h2>
        <span
          className="truncate text-xs text-muted-foreground"
          title={group?.name}
        >
          {group?.name || t('First group')}
        </span>
      </div>
      <Popover.Root
        open={open && selectable}
        onOpenChange={(value) => {
          setOpen(value)
          if (!value) setQuery('')
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            data-testid="quick-proxy-trigger"
            disabled={busy || !selectable}
            className="flex w-full items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2.5 text-left disabled:opacity-60"
          >
            <span className="min-w-0 flex-1">
              <span
                className="block truncate text-sm font-semibold font-emoji"
                title={group?.now}
              >
                {group?.now || t('Connect to see servers')}
              </span>
              {meta && (
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {[meta.type, meta.network].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
            {delay !== undefined && (
              <span className="shrink-0 text-xs tabular-nums">
                {delay < 0 ? t('fail') : t('{0} ms', { 0: delay })}
              </span>
            )}
            {selectable ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              group && <span className="text-xs">{t('Auto')}</span>
            )}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={6}
            align="start"
            collisionPadding={12}
            sticky="always"
            hideWhenDetached
            aria-label={t('Quick proxy selection')}
            data-testid="quick-proxy-popover"
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              search.current?.focus()
            }}
            className="z-50 flex w-[min(360px,calc(100vw-24px))] max-h-[min(360px,var(--radix-popover-content-available-height))] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
              <Search className="h-4 w-4" />
              <input
                ref={search}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={t('Search servers')}
                placeholder={t('Search servers…')}
                className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    e.currentTarget
                      .closest('[data-testid]')
                      ?.querySelector<HTMLButtonElement>('[data-proxy-option]')
                      ?.focus()
                  }
                }}
              />
            </div>
            <div
              className="min-h-0 overflow-y-auto overscroll-contain p-1.5"
              onKeyDown={(e) => {
                if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key))
                  return
                const buttons = Array.from(
                  e.currentTarget.querySelectorAll<HTMLButtonElement>(
                    'button:not(:disabled)',
                  ),
                )
                const i = buttons.indexOf(
                  document.activeElement as HTMLButtonElement,
                )
                const next =
                  e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? buttons.length - 1
                      : Math.max(
                          0,
                          Math.min(
                            buttons.length - 1,
                            i + (e.key === 'ArrowDown' ? 1 : -1),
                          ),
                        )
                e.preventDefault()
                buttons[next]?.focus()
              }}
            >
              {names.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">
                  {t('No matches')}
                </p>
              )}
              {names.map((name) => (
                <button
                  key={name}
                  data-proxy-option
                  type="button"
                  disabled={busy}
                  aria-pressed={name === group?.now}
                  onClick={() => {
                    setOpen(false)
                    setQuery('')
                    if (group && name !== group.now) onSelect(group.name, name)
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring ${name === group?.now ? 'bg-accent' : ''}`}
                >
                  <span className="w-4 shrink-0">
                    {name === group?.now && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 break-words font-emoji">
                    {name}
                  </span>
                  {latencies[name] !== undefined && (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {latencies[name] < 0
                        ? t('fail')
                        : t('{0} ms', { 0: latencies[name] })}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <div
        className="mt-3 flex min-w-0 items-center justify-center gap-2 py-1 text-center"
        data-testid="public-ip"
        data-state={publicIp.state}
        aria-label={t('Public IP')}
        title={publicIp.state === 'pending' ? t('IP updates after cooldown') : publicIp.provider}
      >
        {flag ? (
          <span role="img" aria-label={country} title={country} className="font-emoji shrink-0 text-lg leading-none">{flag}</span>
        ) : <Globe aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 break-all text-xl font-semibold tabular-nums">
          {publicIp.state === 'ready' ? publicIp.ip : '—'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs tabular-nums">
        <div className="flex items-center justify-center gap-1.5">
          <span className="text-muted-foreground">↓</span>
          <span>{formatBytes(traffic?.downTotal ?? 0)}</span>
        </div>
        <div className="flex items-center justify-center gap-1.5">
          <span className="text-muted-foreground">↑</span>
          <span>{formatBytes(traffic?.upTotal ?? 0)}</span>
        </div>
      </div>
    </section>
  )
}
