import { Home, Info, Layers, ScrollText, Settings, Shield } from 'lucide-react'
import type { CoreStatus } from '../../../shared/types'
import type { Tab } from '../hooks/useCheezyState'
import logoUrl from '../assets/logo.svg'

const items: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'proxies', label: 'Proxies', icon: Shield },
  { id: 'profiles', label: 'Profiles', icon: Layers },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'logs', label: 'Logs', icon: ScrollText },
  { id: 'about', label: 'About', icon: Info },
]

interface Props {
  tab: Tab
  onTab: (t: Tab) => void
  status: CoreStatus | null
  productName: string
}

export function Sidebar({ tab, onTab, status, productName }: Props): React.JSX.Element {
  const running = !!status?.running

  return (
    <aside className="flex w-[72px] shrink-0 flex-col items-center border-r border-surface-border bg-surface-raised py-3">
      <div className="mb-5 flex h-12 w-12 items-center justify-center" title={productName}>
        <img src={logoUrl} alt="" className="h-11 w-11" draggable={false} />
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {items.map(({ id, label, icon: Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              onClick={() => onTab(id)}
              className={`group relative flex h-11 w-11 items-center justify-center rounded-xl transition ${
                active
                  ? 'bg-accent-soft text-accent'
                  : 'text-ink-muted hover:bg-surface-overlay hover:text-ink'
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
              <span className="pointer-events-none absolute left-full z-20 ml-2 hidden whitespace-nowrap rounded-md border border-surface-border bg-surface-overlay px-2 py-1 text-xs text-ink shadow-lg group-hover:block group-focus-visible:block">
                {label}
              </span>
            </button>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-2 pb-1">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            running ? 'bg-ok shadow-[0_0_8px_rgba(61,214,140,0.7)]' : 'bg-ink-dim'
          }`}
          title={running ? `Connected · ${status?.mode}` : 'Disconnected'}
          aria-hidden
        />
      </div>
    </aside>
  )
}
