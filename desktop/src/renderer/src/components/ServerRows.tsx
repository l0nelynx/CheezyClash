import { useI18n } from '../lib/i18n'
import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import type { ServerLayout } from '../lib/proxy-layout'
import type { ProxyNodeInfo } from '../../../shared/types'

export function ServerRows({ names, selected, delays, disabled, onSelect, layout = 'list', metadata, maxHeight }: {
  names: string[]; selected: string; delays: Record<string, number>; disabled: boolean; onSelect: (name: string) => void; layout?: ServerLayout; metadata?: Record<string, ProxyNodeInfo>; maxHeight?: number
}): React.JSX.Element {
  const { t } = useI18n()
  const listRef = useRef<HTMLUListElement>(null)
  const [width, setWidth] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const grid = layout !== 'list'
  const large = layout === 'large-grid'
  const gap = grid ? 8 : 0
  const height = large ? 72 : grid ? 56 : 40
  const stride = height + gap
  const columns = grid ? Math.max(1, Math.floor((width + gap) / ((large ? 150 : 116) + gap))) : 1
  const rows = Math.ceil(names.length / columns)
  const bottomPadding = names.length ? 12 : 0
  const viewportHeight = Math.min(maxHeight ?? (grid ? 320 : 256), Math.max(0, rows * stride - gap) + bottomPadding)
  // Virtualize rows in every layout, including narrow groups and resized windows.
  const start = Math.max(0, Math.min(rows - 1, Math.floor(scrollTop / stride)) - 3)
  const end = Math.min(rows, start + Math.ceil(viewportHeight / stride) + 6)

  useEffect(() => {
    const element = listRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0
    setScrollTop(0)
  }, [columns, layout])

  return <ul ref={listRef} tabIndex={0} aria-label={t("Servers")} data-server-layout={layout}
    className={`overflow-y-auto px-2 ${grid ? 'grid content-start' : ''}`}
    style={{ height: viewportHeight, paddingBottom: bottomPadding, gridTemplateColumns: grid ? `repeat(${columns}, minmax(0, 1fr))` : undefined, gap }}
    onScroll={event => setScrollTop(event.currentTarget.scrollTop)}>
    {start > 0 && <li aria-hidden="true" style={{ height: start * stride - gap, gridColumn: '1 / -1' }} />}
    {names.slice(start * columns, end * columns).map(name => {
      const active = selected === name
      const ms = delays[name]
      const info = metadata?.[name]
      return <li key={name} style={{ height }}>
        <button type="button" disabled={disabled} aria-pressed={active} onClick={() => onSelect(name)}
          title={name}
          className={`flex h-full w-full rounded-lg px-3 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${grid ? 'flex-col justify-center gap-1 border text-xs' : 'items-center gap-2 text-sm'} ${active ? 'border-primary/40 bg-primary/10 text-primary' : 'border-surface-border text-ink hover:bg-surface-overlay'}`}>
          <span className={`flex min-w-0 items-center gap-2 ${grid ? 'w-full' : 'flex-1'}`}>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-surface-border'}`}>
              {active && <Check className="h-3 w-3" />}
            </span>
            <span className={`min-w-0 flex-1 truncate font-emoji ${large ? 'font-medium' : ''}`}>{name}</span>
          </span>
          {large && info?.serverDescription && <span data-proxy-description className="w-full truncate text-[11px] leading-tight text-muted-foreground" title={info.serverDescription}>{info.serverDescription}</span>}
          <span className={`flex min-w-0 items-center gap-2 ${large ? 'w-full justify-between' : ''}`}>
          {large && info?.type && <span data-proxy-transport className="min-w-0 truncate text-[10px] text-muted-foreground" title={`${info.type} : ${info.network ?? '—'}`}>{info.type} : {info.network ?? '—'}</span>}
          {ms !== undefined && <span className={`shrink-0 text-xs tabular-nums ${grid && !large ? 'pl-7' : ''} ${ms < 0 ? 'text-danger' : ms < 200 ? 'text-ok' : 'text-muted-foreground'}`}>
            {ms < 0 ? t("fail") : t("{0} ms", {0:ms})}
          </span>}
          </span>
        </button>
      </li>
    })}
    {end < rows && <li aria-hidden="true" style={{ height: (rows - end) * stride - gap, gridColumn: '1 / -1' }} />}
  </ul>
}
