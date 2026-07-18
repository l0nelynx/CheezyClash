import { Minus, Square, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CoreStatus } from '../../../shared/types'
import logoUrl from '../assets/logo.svg'

interface Props {
  status: CoreStatus | null
  productName: string
}

export function TitleBar({ status, productName }: Props): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)
  const running = !!status?.running

  useEffect(() => {
    void window.cheezy.windowIsMaximized().then(setMaximized)
    return window.cheezy.onWindowMaximized(setMaximized)
  }, [])

  return (
    <header className="flex h-10 shrink-0 select-none items-stretch border-b border-surface-border bg-surface-raised">
      <div className="app-drag flex min-w-0 flex-1 items-center gap-2.5 px-3">
        <img src={logoUrl} alt="" className="h-6 w-6 shrink-0" draggable={false} />
        <span className="truncate text-sm font-semibold tracking-tight text-ink">{productName}</span>
        <span className="ml-1 inline-flex items-center gap-1.5 text-xs text-ink-muted">
          <span className={`h-1.5 w-1.5 rounded-full ${running ? 'bg-ok' : 'bg-ink-dim'}`} />
          {running ? `Connected · ${status?.mode?.toUpperCase()}` : 'Disconnected'}
        </span>
        {status?.helperReady && (
          <span className="rounded-md bg-surface-overlay px-2 py-0.5 text-[10px] text-ink-dim">
            helper
          </span>
        )}
      </div>

      <div className="app-no-drag flex shrink-0">
        <WinBtn
          label="Minimize"
          onClick={() => void window.cheezy.windowMinimize()}
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={1.75} />
        </WinBtn>
        <WinBtn
          label={maximized ? 'Restore' : 'Maximize'}
          onClick={() => void window.cheezy.windowMaximizeToggle()}
        >
          <Square className="h-3 w-3" strokeWidth={1.75} />
        </WinBtn>
        <WinBtn
          label="Close"
          danger
          onClick={() => void window.cheezy.windowClose()}
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.75} />
        </WinBtn>
      </div>
    </header>
  )
}

function WinBtn({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-10 w-11 items-center justify-center text-ink-muted transition ${
        danger ? 'hover:bg-danger hover:text-white' : 'hover:bg-surface-overlay hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
