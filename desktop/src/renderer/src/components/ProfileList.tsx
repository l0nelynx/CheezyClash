import { useI18n } from '../lib/i18n'
import { ExternalLink, FileUp, Link2, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { ProfileMeta } from '../../../shared/types'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { subscriptionLabel } from '../lib/privacy'

interface Props {
  profiles: ProfileMeta[]
  activeId: string | null
  busy: boolean
  downloading: boolean
  onImportUrl: (url: string) => Promise<boolean>
  onImportFile: () => void
  onActivate: (id: string) => void
  onUpdate: (id: string) => void
  onDelete: (id: string) => void
}

export function ProfileList({
  profiles,
  activeId,
  busy,
  downloading,
  onImportUrl,
  onImportFile,
  onActivate,
  onUpdate,
  onDelete,
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const [importUrl, setImportUrl] = useState('')

  return (
    <div className="space-y-4">
      <div className="page-card sticky top-0 z-10 bg-card/95 p-4 backdrop-blur">
        {downloading && <Button variant="outline" size="sm" onClick={() => void window.cheezy.cancelSubscriptionDownloads()}>{t("Cancel download")}</Button>}
        <p className="section-label mb-3">{t("Import")}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" />
            <Input
              className="pl-9"
              placeholder={t("Subscription URL")}
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              disabled={busy}
            />
          </div>
          <Button
            type="button"
            disabled={busy || !importUrl.trim()}
            onClick={() => {
              const url = importUrl.trim()
              void onImportUrl(url).then((success) => { if (success) setImportUrl('') })
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("Import URL")}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={onImportFile}>
            <FileUp className="h-4 w-4" />
            {t("File")}</Button>
        </div>
      </div>

      <div className="page-card overflow-hidden">
        <div className="border-b border-surface-border px-4 py-3">
          <p className="text-xs text-ink-dim">{profiles.length} {t("configured")}</p>
        </div>
        {profiles.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t("No profiles yet. Import a subscription or config file.")}</p>
        ) : (
          <ul className="divide-y divide-surface-border">
            {profiles.map((p) => {
              const active = p.id === activeId
              const canUpdate = !!p.url
              const managed = !!p.managedKey || p.id === 'managed-primary'
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink" title={p.name}>
                        {p.name}
                      </span>
                      {active && (
                        <Badge variant="success" className="px-1.5 py-0 text-[10px] uppercase tracking-wide">
                          {t("Active")}</Badge>
                      )}
                      {managed && (
                        <Badge
                          variant="secondary"
                          className="px-1.5 py-0 text-[10px] uppercase tracking-wide text-muted-foreground"
                          title={t("Managed by your account")}
                        >
                          {t("Account")}</Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-ink-dim" title={managed ? undefined : p.url ? subscriptionLabel(p.url) : t("Local file")}>
                      {managed ? t("Account subscription") : p.url ? subscriptionLabel(p.url) : t("Local file")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {!active && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => onActivate(p.id)}
                      >
                        {t("Activate")}</Button>
                    )}
                    {canUpdate && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={busy}
                        onClick={() => onUpdate(p.id)}
                        aria-label={t("Update {0}", {0:p.name})}
                        title={t("Update subscription")}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canUpdate && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={busy}
                        onClick={() => void window.cheezy.openExternal(p.url!)}
                        aria-label={t("Manage {0}", {0:p.name})}
                        title={t("Manage subscription in browser")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {!managed && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(t("Delete profile “{0}”?", {0:p.name}))) onDelete(p.id)
                        }}
                        aria-label={t("Delete {0}", {0:p.name})}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
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
