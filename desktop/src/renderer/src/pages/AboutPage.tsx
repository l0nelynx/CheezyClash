import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'

interface UpdateInfo {
  current: string
  latest: string | null
  updateAvailable: boolean
  releasesUrl: string
  error?: string
}

interface Props {
  productName: string
}

export function AboutPage({ productName }: Props): React.JSX.Element {
  const [appVer, setAppVer] = useState('…')
  const [coreVer, setCoreVer] = useState('…')
  const [update, setUpdate] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    void window.cheezy.getAppVersion().then(setAppVer)
    void window.cheezy.getCoreVersion().then((v) => setCoreVer(v.version || 'unknown'))
    void window.cheezy.checkUpdate().then(setUpdate)
  }, [])

  useEffect(() => {
    document.title = productName
  }, [productName])

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">About</h2>
        <p className="text-sm text-muted-foreground">{productName} desktop client.</p>
      </div>

      <section className="space-y-3 rounded-xl border border-surface-border bg-surface-raised p-4">
        <Row label="Application" value={`${productName} ${appVer}`} />
        <Row label="Engine" value={coreVer} breakAll />
        <div className="border-t border-surface-border pt-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-dim">Documentation</p>
          <button
            type="button"
            className="btn inline-flex items-center gap-1.5 text-xs"
            onClick={() =>
              void window.cheezy.openExternal('https://l0nelynx.github.io/CheezyClash-docs/')
            }
          >
            Open docs
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="border-t border-surface-border pt-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-dim">Updates</p>
          {!update && <p className="text-sm text-muted-foreground">Checking…</p>}
          {update?.error && (
            <p className="text-sm text-muted-foreground">Could not check: {update.error}</p>
          )}
          {update && !update.error && !update.updateAvailable && (
            <p className="text-sm text-ok">You are on the latest version.</p>
          )}
          {update?.updateAvailable && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-ink">
                Update available: <span className="font-medium text-primary">{update.latest}</span>
                <span className="text-muted-foreground"> (current {update.current})</span>
              </p>
              <button
                type="button"
                className="btn inline-flex items-center gap-1.5 text-xs"
                onClick={() => void window.cheezy.openExternal(update.releasesUrl)}
              >
                Open releases
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {update && !update.updateAvailable && !update.error && (
            <button
              type="button"
              className="mt-2 text-xs text-primary hover:underline"
              onClick={() => void window.cheezy.openExternal(update.releasesUrl)}
            >
              View releases on GitHub
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

function Row({
  label,
  value,
  breakAll,
}: {
  label: string
  value: string
  breakAll?: boolean
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span
        className={`text-right text-sm font-medium text-ink ${breakAll ? 'break-all' : ''}`}
      >
        {value}
      </span>
    </div>
  )
}
