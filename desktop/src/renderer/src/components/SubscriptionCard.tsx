import { ExternalLink, LifeBuoy } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { formatBytes } from '../lib/format'
import type { ProfileMeta } from '../../../shared/types'
import { Button } from './ui/button'
export function SubscriptionCard({
  profile,
  onGoProfiles,
}: {
  profile: ProfileMeta | null
  onGoProfiles: () => void
}): React.JSX.Element {
  const { t, language } = useI18n()
  const info = profile?.subscription
  const used = info ? info.upload + info.download : 0
  const limited = !!info && info.total > 0
  const progress = limited
    ? Math.max(0, Math.min(100, (used / info.total) * 100))
    : 0
  return (
    <section
      className="page-card min-w-0 p-4"
      data-testid="subscription-widget"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('Subscription')}</h2>
        <button
          type="button"
          onClick={onGoProfiles}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {t('Profiles')}
        </button>
      </div>
      <p className="truncate text-sm font-medium" title={profile?.name}>
        {profile?.name || t('No active profile')}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {profile ? t('Active profile') : t('Add a profile to connect')}
      </p>
      {info ? (
        <>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-1">
            <strong className="text-base font-medium tabular-nums">
              {formatBytes(used)}
            </strong>
            <span className="text-xs text-muted-foreground">
              {t('Limit')}: {limited ? formatBytes(info.total) : t('Unlimited')}
            </span>
          </div>
          {limited && (
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"
              role="progressbar"
              aria-label={t('Used')}
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-primary"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {t('Expires')}:{' '}
            <span className="text-foreground">
              {info.expire > 0
                ? new Date(info.expire * 1000).toLocaleDateString(language)
                : '—'}
            </span>
          </p>
          {info.expire > 0 && info.expire * 1000 < Date.now() && (
            <p className="text-xs text-destructive">
              {t('Subscription expired')}
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          {t('No subscription information')}
        </p>
      )}
      {(profile?.url || info?.supportUrl) && (
        <div className="mt-3 flex flex-wrap gap-1 border-t border-border pt-2">
          {profile?.url && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => void window.cheezy.openExternal(profile.url!)}
            >
              <ExternalLink className="h-3 w-3" />
              {t('Subscription')}
            </Button>
          )}
          {info?.supportUrl && (
            <Button
              data-testid="subscription-support"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => void window.cheezy.openExternal(info.supportUrl!)}
            >
              <LifeBuoy className="h-3 w-3" />
              {t('Support')}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
