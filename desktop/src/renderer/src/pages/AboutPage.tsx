import { useI18n } from '../lib/i18n'
import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Button } from '../components/ui/button'

import type { DesktopUpdate } from '../../../shared/desktop-update'
import { Switch } from '../components/ui/switch'

interface Props {
  productName: string
  update: DesktopUpdate | null
  autoDownload: boolean
  disabled: boolean
  onAutoDownload: (enabled: boolean) => void
}

export function AboutPage({ productName, update, autoDownload, disabled, onAutoDownload }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [appVer, setAppVer] = useState('…')
  const [coreVer, setCoreVer] = useState('…')
  const phase = update?.phase
  const busy = disabled || phase === 'checking' || phase === 'downloading' || phase === 'installing'
  const manualInstall = update?.format === 'dmg' || update?.format === 'zip'

  useEffect(() => {
    void window.cheezy.getAppVersion().then(setAppVer)
    void window.cheezy.getCoreVersion().then((v) => setCoreVer(v.version || 'unknown'))
  }, [])

  useEffect(() => {
    document.title = productName
  }, [productName])

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">{t("About")}</h2>
        <p className="text-sm text-muted-foreground">{productName} {t("desktop client.")}</p>
      </div>

      <section className="page-card space-y-3 p-4">
        <Row label={t("Application")} value={`${productName} ${appVer}`} />
        <Row label={t("Core")} value={coreVer} breakAll />
        <div className="border-t border-surface-border pt-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-dim">{t("Documentation")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              void window.cheezy.openExternal('https://l0nelynx.github.io/CheezyClash-docs/')
            }
          >
            {t("Open docs")}<ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="border-t border-surface-border pt-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-dim">{t("Updates")}</p>
          <label className="flex items-center justify-between gap-3 py-2 text-sm">
            {t('Download updates in the background')}
            <Switch checked={autoDownload} disabled={disabled} onCheckedChange={onAutoDownload} />
          </label>
          <div className="space-y-2 text-sm" role="status">
            {phase === 'checking' && <p>{t('Checking…')}</p>}
            {phase === 'current' && <p>{t('You are on the latest version.')}</p>}
            {update?.latest && <p>{t('Update available:')} {update.latest}</p>}
            {phase === 'downloading' && <p>{t('Downloading…')} {update?.progress ?? 0}%</p>}
            {phase === 'installing' && <p>{t('Preparing the update…')}</p>}
            {update?.error && <p>{update.error}</p>}
            {phase === 'ready' && <p>{t(update?.format === 'dmg'
              ? 'Open the DMG, quit the client and drag the app to Applications to replace it.'
              : update?.format === 'zip' ? 'Quit the client before extracting the ZIP over your portable copy.'
              : 'Installing will disconnect the VPN and close the client.')}</p>}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void window.cheezy.checkUpdate()}>
              {t('Check for updates')}
            </Button>
            {phase === 'available' && <Button size="sm" onClick={() => void window.cheezy.downloadUpdate()}>{t('Download')}</Button>}
            {phase === 'ready' && <>
              <Button size="sm" onClick={() => void window.cheezy.installUpdate()}>
                {t(update?.format === 'dmg' ? 'Open DMG' : update?.format === 'zip' ? 'Show ZIP' : 'Install update')}
              </Button>
              {manualInstall && <Button size="sm" variant="outline" onClick={() => void window.cheezy.quitApp()}>{t('Quit client')}</Button>}
              {update?.showFile && <Button size="sm" variant="outline" onClick={() => void window.cheezy.showUpdateFile()}>{t('Show downloaded file')}</Button>}
            </>}
            {update && <Button size="sm" variant="link" onClick={() => void window.cheezy.openExternal(update.releasesUrl)}>
              {t('Open releases')}<ExternalLink className="h-3.5 w-3.5" />
            </Button>}
          </div>
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
  const { t } = useI18n()
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-sm text-muted-foreground">{t(label)}</span>
      <span
        className={`text-right text-sm font-medium text-ink ${breakAll ? 'break-all' : ''}`}
      >
        {value}
      </span>
    </div>
  )
}
