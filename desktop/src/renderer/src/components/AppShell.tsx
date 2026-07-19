import { X } from 'lucide-react'
import type { CoreStatus } from '../../../shared/types'
import type { Tab } from '../hooks/useCheezyState'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'

interface Props {
  tab: Tab
  onTab: (t: Tab) => void
  status: CoreStatus | null
  error: string | null
  notice: string | null
  onClearError: () => void
  onClearNotice: () => void
  productName: string
  children: React.ReactNode
}

export function AppShell({
  tab,
  onTab,
  status,
  error,
  notice,
  onClearError,
  onClearNotice,
  productName,
  children,
}: Props): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TitleBar status={status} productName={productName} />
      <div className="flex min-h-0 flex-1">
        <Sidebar tab={tab} onTab={onTab} status={status} productName={productName} />
        <div className="flex min-w-0 flex-1 flex-col">
          {error && (
            <div
              role="alert"
              className="mx-5 mt-3 flex items-start gap-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              <p className="min-w-0 flex-1 break-words">{error}</p>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 hover:bg-danger/20"
                aria-label="Dismiss"
                onClick={onClearError}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {notice && !error && (
            <div
              role="status"
              className="mx-5 mt-3 flex items-start gap-3 rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok"
            >
              <p className="min-w-0 flex-1 break-words">{notice}</p>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 hover:bg-ok/20"
                aria-label="Dismiss"
                onClick={onClearNotice}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <main className="min-h-0 flex-1 overflow-y-auto p-5">{children}</main>
        </div>
      </div>
    </div>
  )
}
