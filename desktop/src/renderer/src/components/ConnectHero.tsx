import { useI18n } from '../lib/i18n'
import { Info, Loader2, Power } from 'lucide-react'
import { useState } from 'react'
import { ConnectionClock } from './ConnectionClock'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from './ui/alert-dialog'
import type {
  AppSettings,
  ConnectionMode,
  CoreStatus,
  ProfileMeta,
  TunStatus,
} from '../../../shared/types'
import { DownloadRateSparkline } from './DownloadRateSparkline'
import { formatRate } from '../lib/format'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

interface Props {
  settings: AppSettings | null
  onConnectionMode: (mode: ConnectionMode) => void
  connectionAction: string | null
  status: CoreStatus | null
  tun: TunStatus | null
  busy: boolean
  customRuleCount: number
  onOpenCustomRules: () => void
  hasProfile: boolean
  activeProfile: ProfileMeta | null
  downRateHistory: number[]
  downRate: number
  upRate: number
  onConnect: () => void
  onDisconnect: () => void
  onEnsureHelper: () => void
  onConnectProxy?: () => void
  onGoProfiles?: () => void
}

export function ConnectHero({
  settings,
  onConnectionMode,
  status,
  connectionAction,
  tun,
  busy,
  customRuleCount,
  onOpenCustomRules,
  hasProfile,
  activeProfile,
  downRateHistory,
  downRate,
  upRate,
  onConnect,
  onDisconnect,
  onEnsureHelper,
  onConnectProxy,
  onGoProfiles,
}: Props): React.JSX.Element {
  const { t } = useI18n()
  const [pendingMode, setPendingMode] = useState<ConnectionMode | null>(null)
  const running = !!status?.running
  const profileTitle =
    activeProfile?.subscription?.title?.trim() ||
    activeProfile?.name?.trim() ||
    t('Ready to connect')
  const selectedMode = running
    ? status.mode
    : settings?.networkOverrideEnabled
      ? settings.connectionMode
      : (status?.mode ?? 'proxy')
  const modeLabel = selectedMode === 'tun' ? 'TUN' : 'Proxy'
  const error = status?.lastError || tun?.lastError
  const lastError = error
    ? error.includes('no active profile')
      ? t('Import or activate a profile first.')
      : error
    : null
  const setupLabel =
    tun?.macSetup === 'approval'
      ? t('Waiting for permission…')
      : tun?.macSetup === 'installing'
        ? t('Setting up TUN…')
        : tun?.macSetup === 'removing'
          ? t('Removing TUN service…')
          : null

  return (
    <section
      className="page-card relative overflow-hidden p-5"
      data-testid="connection-widget"
    >
      <DownloadRateSparkline
        values={downRateHistory}
        accentColor="#d9be57"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-25"
      />
      <div className="relative z-10">
        <div className="flex items-center justify-end gap-3">
          <Badge
            data-testid="core-status"
            data-state={
              busy || setupLabel || connectionAction
                ? 'pending'
                : lastError
                  ? 'error'
                  : running
                    ? 'running'
                    : 'stopped'
            }
            variant={
              busy || setupLabel || connectionAction
                ? 'secondary'
                : lastError
                  ? 'destructive'
                  : running
                    ? 'success'
                    : 'secondary'
            }
            className={
              running && !lastError && !busy && !setupLabel && !connectionAction
                ? 'text-emerald-700 dark:text-emerald-400'
                : undefined
            }
          >
            {setupLabel ??
              connectionAction ??
              (lastError
                ? t('Core error')
                : running
                  ? t('Core running')
                  : t('Disconnected'))}
          </Badge>
        </div>
        <div className="my-4 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2
              data-testid="profile-title"
              className="line-clamp-2 break-words text-2xl font-semibold tracking-tight"
              title={profileTitle}
            >
              {profileTitle}
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {status?.readOnly
                ? t('Live view. Connection is managed by the running client.')
                : running
                ? modeLabel === 'TUN'
                  ? t('TUN is running. Routing follows the profile rules.')
                  : t(
                      'Proxy is running. Use the system proxy or configure your apps to route traffic through it.',
                    )
                : hasProfile
                  ? t('Choose a mode, then connect.')
                  : t(
                      'Add a subscription or profile file on Profiles, then connect.',
                    )}
            </p>
            <ConnectionClock
              running={running}
              connectedAt={status?.connectedAt}
            />
          </div>
          <div className="flex w-24 shrink-0 flex-col items-center gap-2">
            <button
              type="button"
              data-testid="power-button"
              aria-label={
                running
                  ? t('Disconnect')
                  : hasProfile
                    ? t('Connect')
                    : t('Go to Profiles')
              }
              disabled={busy || status?.readOnly}
              title={status?.readOnly ? t('Connection and profile changes are managed by the running client.') : undefined}
              onClick={
                running ? onDisconnect : hasProfile ? onConnect : onGoProfiles
              }
              className={`flex h-20 w-20 items-center justify-center rounded-full border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background disabled:opacity-50 ${running ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border bg-secondary text-foreground hover:bg-accent'}`}
            >
              {busy ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                <Power className="h-8 w-8" />
              )}
              <span className="sr-only">
                {running
                  ? t('Disconnect')
                  : hasProfile
                    ? t('Connect')
                    : t('Go to Profiles')}
              </span>
            </button>
            <span className="text-xs text-muted-foreground">
              {running
                ? t('Disconnect')
                : hasProfile
                  ? t('Connect')
                  : t('Go to Profiles')}
            </span>
          </div>
        </div>
        {!running &&
          hasProfile &&
          tun?.macSetup &&
          lastError &&
          onConnectProxy && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={onConnectProxy}
            >
              {t('Connect through Proxy')}
            </Button>
          )}
        {!running && tun?.enabled && tun?.macSetup && !tun.privilegesOk && (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {t(
              'On first connection, macOS will ask to install a system service. Connection continues automatically after approval.',
            )}
          </p>
        )}
        {!running && tun?.macSetup && lastError && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              'Proxy uses the Desktop network settings and only routes apps that use a proxy.',
            )}
          </p>
        )}

        {running && status?.configUpdateAvailable && (
          <p
            role="status"
            data-testid="config-update-hint"
            className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground"
          >
            <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t('Configuration updated. Reconnect to apply.')}</span>
          </p>
        )}

        {lastError && (
          <p className="mt-4 text-sm text-destructive">{t(lastError)}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <div
            className="inline-flex rounded-lg border border-border p-0.5"
            role="group"
            aria-label={t('Connection mode')}
          >
            {(['proxy', 'tun'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={busy || status?.readOnly || !settings?.networkOverrideEnabled}
                aria-pressed={selectedMode === mode}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${selectedMode === mode ? 'bg-secondary text-primary' : 'text-muted-foreground'}`}
                onClick={() => {
                  if (mode === selectedMode) return
                  if (running) setPendingMode(mode)
                  else onConnectionMode(mode)
                }}
              >
                {mode === 'tun' ? 'TUN' : 'Proxy'}
              </button>
            ))}
          </div>
          <span className="tabular-nums">
            ↓ {formatRate(running ? downRate : 0)}
          </span>
          <span className="tabular-nums">
            ↑ {formatRate(running ? upRate : 0)}
          </span>
          <button
            type="button"
            className="rounded-sm text-left underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={onOpenCustomRules}
          >
            {t('Custom Rules')}:{' '}
            <span className="font-medium text-foreground">
              {customRuleCount}
            </span>
            {customRuleCount === 0 && (
              <span className="ml-1.5 text-primary">{t('Add rules')}</span>
            )}
          </button>
          {tun?.enabled && !status?.readOnly && (
            <>
              <span>
                {t('VPN helper:')}{' '}
                <span className="text-foreground">
                  {tun?.helperRunning
                    ? t('running')
                    : tun?.helperInstalled
                      ? t('installed')
                      : t('not installed')}
                </span>
              </span>
              <span>
                {t('Setup:')}{' '}
                <span
                  className={tun?.privilegesOk ? 'text-ok' : 'text-foreground'}
                >
                  {tun?.privilegesOk ? t('ready') : t('needs setup')}
                </span>
              </span>
              {!tun?.privilegesOk &&
                !tun?.macSetup &&
                tun?.helperSetupAvailable !== false && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    disabled={busy}
                    onClick={onEnsureHelper}
                  >
                    {t('Install helper')}
                  </Button>
                )}
            </>
          )}
        </div>
        {!settings?.networkOverrideEnabled && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('Mode is controlled by the profile.')}
          </p>
        )}
      </div>
      <AlertDialog
        open={pendingMode !== null}
        onOpenChange={(open) => {
          if (!open) setPendingMode(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{t('Change connection mode?')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'The connection will restart. Active connections may be interrupted.',
            )}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingMode) onConnectionMode(pendingMode)
                setPendingMode(null)
              }}
            >
              {t('Reconnect')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
