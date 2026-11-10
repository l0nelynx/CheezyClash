import { useI18n } from '../lib/i18n'
import { useEffect, useState } from 'react'
import {
  Home,
  Layers,
  Settings,
  Shield,
  Activity,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
} from 'lucide-react'
import type { CoreStatus } from '../../../shared/types'
import type { Tab } from '../hooks/useCheezyState'
import logoUrl from '../assets/logo.svg'

const items: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'proxies', label: 'Proxies', icon: Shield },
  { id: 'connections', label: 'Connections', icon: Activity },
  { id: 'profiles', label: 'Profiles', icon: Layers },
  { id: 'settings', label: 'Settings', icon: Settings },
]

interface Props {
  tab: Tab
  onTab: (t: Tab) => void
  status: CoreStatus | null
  productName: string
}

export function Sidebar({ tab, onTab, productName, status }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('cheezy-sidebar-collapsed') === 'true'
    } catch {
      return false
    }
  })
  const [version, setVersion] = useState('—')
  const [quitting, setQuitting] = useState(false)
  const [quitError, setQuitError] = useState(false)
  useEffect(() => {
    let active = true
    void window.cheezy
      .getAppVersion()
      .then((value) => {
        if (active) setVersion(value)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])
  const toggleSidebar = (): void => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem('cheezy-sidebar-collapsed', String(next))
    } catch {
      /* Session-only preference. */
    }
  }
  const quit = async (): Promise<void> => {
    setQuitting(true)
    setQuitError(false)
    try {
      await window.cheezy.quitApp()
    } catch {
      setQuitError(true)
      setQuitting(false)
    }
  }

  return (
    <aside
      data-testid="sidebar"
      data-collapsed={collapsed}
      className={`flex shrink-0 flex-col items-stretch border-r border-sidebar-border bg-sidebar px-2 py-3 ${collapsed ? 'w-[64px]' : 'w-[140px]'}`}
    >
      <div
        className="mb-1 flex h-14 items-center justify-center"
        title={productName}
      >
        <img
          src={logoUrl}
          alt={productName}
          className="h-14 w-14 max-w-none shrink-0"
          draggable={false}
        />
      </div>
      <button
        type="button"
        data-testid="sidebar-toggle"
        aria-expanded={!collapsed}
        aria-controls="sidebar-navigation"
        title={t(collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
        aria-label={t(collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
        className="mb-3 flex h-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent focus-visible:ring-1 focus-visible:ring-ring"
        onClick={toggleSidebar}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-4 w-4" />
        ) : (
          <PanelLeftClose className="h-4 w-4" />
        )}
      </button>
      <nav id="sidebar-navigation" className="flex flex-1 flex-col gap-1">
        {items.map(({ id, label, icon: Icon }) => {
          const active =
            tab === id ||
            (id === 'settings' && (tab === 'logs' || tab === 'about'))
          return (
            <button
              key={id}
              type="button"
              title={t(label)}
              aria-label={t(label)}
              aria-current={active ? 'page' : undefined}
              onClick={() => onTab(id)}
              className={`group relative flex h-10 w-full items-center gap-2 rounded-lg text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring ${collapsed ? 'justify-center px-0' : 'px-2.5'} ${
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : ''}`}
                strokeWidth={active ? 2.25 : 1.75}
              />
              <span className={collapsed ? 'sr-only' : 'text-sm'}>
                {t(label)}
              </span>
            </button>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2 border-t border-sidebar-border pt-3">
        <span
          data-testid="sidebar-version"
          className="truncate text-center text-[11px] tabular-nums text-muted-foreground"
          title={`${t('Version')}: ${version}`}
        >
          {version}
        </span>
        <button
          type="button"
          data-testid="quit-app"
          disabled={quitting}
          onClick={() => void quit()}
          title={t(status?.readOnly ? 'Close live UI' : 'Quit and disconnect')}
          aria-label={t(status?.readOnly ? 'Close live UI' : 'Quit and disconnect')}
          className={`flex h-9 items-center gap-2 rounded-lg text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground disabled:opacity-50 focus-visible:ring-1 focus-visible:ring-ring ${collapsed ? 'justify-center' : 'px-2.5'}`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className={collapsed ? 'sr-only' : ''}>{t('Quit')}</span>
        </button>
        {quitError && (
          <p role="alert" className="break-words text-xs text-destructive">
            {t('Could not quit the app. Try again.')}
          </p>
        )}
      </div>
    </aside>
  )
}
