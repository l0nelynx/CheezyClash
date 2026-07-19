import { FileUp, Link2, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { ProfileMeta } from '../../../shared/types'

interface Props {
  profiles: ProfileMeta[]
  activeId: string | null
  busy: boolean
  onImportUrl: (url: string) => Promise<void>
  onImportFile: () => void
  onActivate: (id: string) => void
  onUpdate: (id: string) => void
  onDelete: (id: string) => void
}

export function ProfileList({
  profiles,
  activeId,
  busy,
  onImportUrl,
  onImportFile,
  onActivate,
  onUpdate,
  onDelete,
}: Props): React.JSX.Element {
  const [importUrl, setImportUrl] = useState('')

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 rounded-xl border border-surface-border bg-surface-raised/95 p-4 backdrop-blur">
        <p className="section-label mb-3">Import</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" />
            <input
              className="field pl-9"
              placeholder="Subscription URL"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              disabled={busy}
            />
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !importUrl.trim()}
            onClick={() => {
              const url = importUrl.trim()
              void onImportUrl(url).then(() => setImportUrl(''))
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Import URL
          </button>
          <button type="button" className="btn" disabled={busy} onClick={onImportFile}>
            <FileUp className="h-4 w-4" />
            File
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-raised">
        <div className="border-b border-surface-border px-4 py-3">
          <p className="text-xs text-ink-dim">{profiles.length} configured</p>
        </div>
        {profiles.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">
            No profiles yet. Import a subscription or config file.
          </p>
        ) : (
          <ul className="divide-y divide-surface-border">
            {profiles.map((p) => {
              const active = p.id === activeId
              const canUpdate = !!p.url
              const managed = p.id === 'managed-primary'
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink" title={p.name}>
                        {p.name}
                      </span>
                      {active && (
                        <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                          Active
                        </span>
                      )}
                      {managed && (
                        <span
                          className="rounded-md bg-surface-overlay px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-dim"
                          title="Managed by your account"
                        >
                          Account
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-ink-dim" title={p.url || 'Local file'}>
                      {p.url || 'Local file'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {!active && (
                      <button
                        type="button"
                        className="btn px-2.5 py-1.5 text-xs"
                        disabled={busy}
                        onClick={() => onActivate(p.id)}
                      >
                        Activate
                      </button>
                    )}
                    {canUpdate && (
                      <button
                        type="button"
                        className="btn px-2.5 py-1.5 text-xs"
                        disabled={busy}
                        onClick={() => onUpdate(p.id)}
                        aria-label={`Update ${p.name}`}
                        title="Update subscription"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {!managed && (
                      <button
                        type="button"
                        className="btn-danger px-2.5 py-1.5 text-xs"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Delete profile “${p.name}”?`)) onDelete(p.id)
                        }}
                        aria-label={`Delete ${p.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
