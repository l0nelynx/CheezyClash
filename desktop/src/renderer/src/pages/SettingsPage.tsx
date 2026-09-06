import { useI18n } from '../lib/i18n'
import { useEffect, useId, useState } from 'react'
import {
  ArrowLeft,
  AppWindow,
  ChevronRight,
  ExternalLink,
  LayoutDashboard,
  ListFilter,
  Network,
  PlugZap,
  Shuffle,
} from 'lucide-react'
import type { CustomRule } from '../../../shared/custom-rules'
import type { AppSettings, ConnectionMode, CoreStatus } from '../../../shared/types'
import type { PrivateAccountSession } from '../../../shared/private-api'
import { CustomRulesModal } from '../components/CustomRulesModal'
import { Switch } from '../components/ui/switch'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'

type SettingsSection = 'application' | 'connection' | 'network' | 'xrayMux'

interface Props {
  settings: AppSettings
  busy: boolean
  session: PrivateAccountSession | null
  supportsAuth: boolean
  status: CoreStatus | null
  onPatch: (patch: Partial<AppSettings>) => void
  onConnectionMode: (mode: ConnectionMode) => void
  onCustomRulesChange: (rules: CustomRule[]) => Promise<void> | void
  onLogin: () => void
  onLogout: () => void
  onSyncSubscription: () => void
}

export function SettingsPage({
  settings,
  busy,
  session,
  supportsAuth,
  status,
  onPatch,
  onConnectionMode,
  onCustomRulesChange,
  onLogin,
  onLogout,
  onSyncSubscription,
}: Props): React.JSX.Element {
  const { t, language, setLanguage, theme, setTheme } = useI18n()
  const [section, setSection] = useState<SettingsSection | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  const [portDraft, setPortDraft] = useState(String(settings.mixedPort))
  const [mtuDraft, setMtuDraft] = useState(String(settings.tunMtu))
  const [muxConcurrencyDraft, setMuxConcurrencyDraft] = useState(
    String(settings.xrayMuxConcurrency),
  )
  const [muxMaxConnectionsDraft, setMuxMaxConnectionsDraft] = useState(
    String(settings.xrayMuxMaxConnections),
  )
  const [muxMaxDialsDraft, setMuxMaxDialsDraft] = useState(
    String(settings.xrayMuxMaxDialsPerMinute),
  )

  const openDashboard = (): void => {
    setDashboardError(null)
    void window.cheezy.openDashboard().catch(() => {
      setDashboardError(t("Could not open Zashboard. Check that the VPN is running and try again."))
    })
  }
  const commitPort = (): void => {
    const next = Number(portDraft)
    if (!Number.isFinite(next) || next < 1024 || next > 65535)
      return setPortDraft(String(settings.mixedPort))
    if (next !== settings.mixedPort) onPatch({ mixedPort: next })
  }
  const commitMtu = (): void => {
    const next = Number(mtuDraft)
    if (!Number.isInteger(next) || next < 576 || next > 9000)
      return setMtuDraft(String(settings.tunMtu))
    if (next !== settings.tunMtu) onPatch({ tunMtu: next })
  }
  const commitMuxConcurrency = (): void => {
    const next = Number(muxConcurrencyDraft)
    if (!Number.isInteger(next) || next < 1)
      return setMuxConcurrencyDraft(String(settings.xrayMuxConcurrency))
    if (next !== settings.xrayMuxConcurrency) onPatch({ xrayMuxConcurrency: next })
  }
  const commitMuxMaxConnections = (): void => {
    const next = Number(muxMaxConnectionsDraft)
    if (!Number.isInteger(next) || next < 0)
      return setMuxMaxConnectionsDraft(String(settings.xrayMuxMaxConnections))
    if (next !== settings.xrayMuxMaxConnections) onPatch({ xrayMuxMaxConnections: next })
  }
  const commitMuxMaxDials = (): void => {
    const next = Number(muxMaxDialsDraft)
    if (!Number.isInteger(next) || next < 0)
      return setMuxMaxDialsDraft(String(settings.xrayMuxMaxDialsPerMinute))
    if (next !== settings.xrayMuxMaxDialsPerMinute) onPatch({ xrayMuxMaxDialsPerMinute: next })
  }

  useEffect(() => setPortDraft(String(settings.mixedPort)), [settings.mixedPort])
  useEffect(() => setMtuDraft(String(settings.tunMtu)), [settings.tunMtu])
  useEffect(
    () => setMuxConcurrencyDraft(String(settings.xrayMuxConcurrency)),
    [settings.xrayMuxConcurrency],
  )
  useEffect(
    () => setMuxMaxConnectionsDraft(String(settings.xrayMuxMaxConnections)),
    [settings.xrayMuxMaxConnections],
  )
  useEffect(
    () => setMuxMaxDialsDraft(String(settings.xrayMuxMaxDialsPerMinute)),
    [settings.xrayMuxMaxDialsPerMinute],
  )

  const mode = settings.connectionMode ?? (settings.tunEnabled ? 'tun' : 'proxy')
  const signedIn = !!session?.email
  const networkLocked = busy || !settings.networkOverrideEnabled
  const ruleCount = settings.customRules?.length ?? 0

  const subpage =
    section === 'application' ? (
      <SettingsSubpage title={t("Application")} onBack={() => setSection(null)}>
        <Toggle
          label={t("Launch at system startup")}
          hint={t("Start quietly in the tray when you sign in to your computer")}
          checked={settings.autoStart}
          disabled={busy}
          onChange={(value) => onPatch({ autoStart: value })}
        />
        <Toggle
          label={t("Connect when the app starts")}
          hint={t("Connect the active profile after every manual or system launch")}
          checked={settings.autoConnect}
          disabled={busy}
          onChange={(value) => onPatch({ autoConnect: value })}
        />
      </SettingsSubpage>
    ) : section === 'connection' ? (
      <SettingsSubpage title={t("Connection")} onBack={() => setSection(null)}>
        <Toggle
          label={t("Override YAML network settings")}
          hint={t("Use the Desktop mode, proxy, TUN, and network values instead of the profile YAML")}
          checked={settings.networkOverrideEnabled}
          disabled={busy}
          onChange={(value) => onPatch({ networkOverrideEnabled: value })}
        />
        {!settings.networkOverrideEnabled && (
          <p className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-xs text-ink-dim">
            {t("Network settings are controlled by the Provider. The saved Desktop values below are not applied.")}</p>
        )}
        <div>
          <p className="mb-2 text-sm font-medium text-ink">{t("Mode")}</p>
          <p className="mb-3 text-xs text-ink-dim">{t("Applies when you connect.")}</p>
          <div
            className="inline-flex rounded-lg border border-surface-border p-0.5"
            role="radiogroup"
            aria-label={t("Connection mode")}
          >
            <ModeButton
              label="Proxy"
              active={mode === 'proxy'}
              disabled={networkLocked}
              onClick={() => onConnectionMode('proxy')}
            />
            <ModeButton
              label="TUN"
              active={mode === 'tun'}
              disabled={networkLocked}
              onClick={() => onConnectionMode('tun')}
            />
          </div>
        </div>
        <Toggle
          label={t("System proxy")}
          hint={t("Route system traffic through the app while connected (Proxy mode)")}
          checked={settings.systemProxy}
          disabled={networkLocked}
          onChange={(value) => onPatch({ systemProxy: value })}
        />
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink">{t("TUN stack")}</span>
          <Select
            value={settings.tunStack}
            disabled={networkLocked || mode !== 'tun'}
            onValueChange={(value) => onPatch({ tunStack: value as AppSettings['tunStack'] })}
          >
            <SelectTrigger className="max-w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mixed">mixed</SelectItem>
              <SelectItem value="system">system</SelectItem>
              <SelectItem value="gvisor">gvisor</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <NumberSetting
          label={t("TUN MTU")}
          hint={t("576–9000; default 1500")}
          value={mtuDraft}
          min={576}
          max={9000}
          disabled={networkLocked || mode !== 'tun'}
          onChange={setMtuDraft}
          onCommit={commitMtu}
        />
      </SettingsSubpage>
    ) : section === 'network' ? (
      <SettingsSubpage title={t("Network")} onBack={() => setSection(null)}>
        <Toggle
          label={t("Allow LAN")}
          hint={t("Let other devices on your network use this connection")}
          checked={settings.allowLan}
          disabled={networkLocked}
          onChange={(value) => onPatch({ allowLan: value })}
        />
        <NumberSetting
          label={t("Port")}
          value={portDraft}
          min={1024}
          max={65535}
          disabled={networkLocked}
          onChange={setPortDraft}
          onCommit={commitPort}
        />
      </SettingsSubpage>
    ) : section === 'xrayMux' ? (
      <SettingsSubpage title="Xray Mux" onBack={() => setSection(null)}>
        <Toggle
          label={t("Enable Mux.Cool")}
          hint={t("Apply Xray-compatible multiplexing to every VLESS proxy without flow")}
          checked={settings.xrayMuxEnabled}
          disabled={busy}
          onChange={(value) => onPatch({ xrayMuxEnabled: value })}
        />
        <NumberSetting
          label={t("Concurrency")}
          hint={t("Active TCP streams per carrier after soft-grow; default 32")}
          value={muxConcurrencyDraft}
          min={1}
          disabled={busy || !settings.xrayMuxEnabled}
          onChange={setMuxConcurrencyDraft}
          onCommit={commitMuxConcurrency}
        />
        <NumberSetting
          label={t("Max connections")}
          hint={t("Soft-grow target + hard cap; 0 — pack-first / unlimited")}
          value={muxMaxConnectionsDraft}
          min={0}
          disabled={busy || !settings.xrayMuxEnabled}
          onChange={setMuxMaxConnectionsDraft}
          onCommit={commitMuxMaxConnections}
        />
        <NumberSetting
          label={t("Max dials per minute")}
          hint={t("New physical dial budget; 0 — unlimited")}
          value={muxMaxDialsDraft}
          min={0}
          disabled={busy || !settings.xrayMuxEnabled}
          onChange={setMuxMaxDialsDraft}
          onCommit={commitMuxMaxDials}
        />
      </SettingsSubpage>
    ) : null

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {subpage ?? (
        <>
          <div>
            <h2 className="text-lg font-semibold text-ink">{t("Settings")}</h2>
            <p className="text-sm text-muted-foreground">{t("Application, connection, and routing.")}</p>
          </div>
          <Section title={t('Appearance')}>
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-2 text-sm"><span className="block">{t('Language')}</span>
                <select data-testid="language" aria-label={t("Language")} value={language} onChange={event => setLanguage(event.target.value as 'ru' | 'en')} className="w-full rounded-md border border-border bg-card px-3 py-2">
                  <option value="en">English</option><option value="ru">Русский</option>
                </select>
              </label>
              <label className="space-y-2 text-sm"><span className="block">{t('Theme')}</span>
                <select data-testid="theme" aria-label={t("Theme")} value={theme} onChange={event => setTheme(event.target.value as 'system' | 'light' | 'dark')} className="w-full rounded-md border border-border bg-card px-3 py-2">
                  <option value="system">{t('System')}</option><option value="light">{t('Light')}</option><option value="dark">{t('Dark')}</option>
                </select>
              </label>
            </div>
          </Section>
          {supportsAuth && (
            <Section title={t("Account")}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">
                    {session?.email || t("Not signed in")}
                  </p>
                  <p className="text-xs text-ink-dim">
                    {signedIn
                      ? session?.emailVerified === false
                        ? t("Email not verified")
                        : t("Account")
                      : t("Using a subscription imported from a link")}
                  </p>
                </div>
                {signedIn ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={onSyncSubscription}
                    >
                      {t("Sync")}</Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={busy}
                      onClick={onLogout}
                    >
                      {t("Log out")}</Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={onLogin}
                  >
                    {t("Sign in")}</Button>
                )}
              </div>
            </Section>
          )}
          <nav
            className="page-card divide-y divide-surface-border overflow-hidden"
            aria-label={t("Settings sections")}
          >
            <MenuRow
              icon={<AppWindow className="h-4 w-4" />}
              title={t("Application")}
              detail={t("Startup and automatic connection")}
              onClick={() => setSection('application')}
            />
            <MenuRow
              icon={<PlugZap className="h-4 w-4" />}
              title={t("Connection")}
              detail={t("Desktop override, mode, system proxy, and TUN")}
              onClick={() => setSection('connection')}
            />
            <MenuRow
              icon={<Network className="h-4 w-4" />}
              title={t("Network")}
              detail={t("LAN access and mixed proxy port")}
              onClick={() => setSection('network')}
            />
            <MenuRow
              icon={<Shuffle className="h-4 w-4" />}
              title="Xray Mux"
              detail={t("Multiplexing limits for VLESS proxies")}
              onClick={() => setSection('xrayMux')}
            />
            <MenuRow
              icon={<ListFilter className="h-4 w-4" />}
              title={t("Custom Rules")}
              detail={
                ruleCount === 0 ? t("No rules") : `${ruleCount} rule${ruleCount === 1 ? '' : 's'}`
              }
              onClick={() => setRulesOpen(true)}
            />
            <MenuRow
              icon={<LayoutDashboard className="h-4 w-4" />}
              title="Zashboard"
              detail={t("Open with the active controller credentials")}
              disabled={busy || !status?.running}
              trailing={<ExternalLink className="h-4 w-4" />}
              onClick={openDashboard}
            />
            {dashboardError && (
              <p role="alert" className="px-4 text-sm text-destructive">{t(dashboardError)}</p>
            )}
          </nav>
        </>
      )}
      <CustomRulesModal
        open={rulesOpen}
        rules={settings.customRules ?? []}
        busy={busy}
        onClose={() => setRulesOpen(false)}
        onSave={onCustomRulesChange}
      />
    </div>
  )
}

function SettingsSubpage({
  title,
  onBack,
  children,
}: {
  title: string
  onBack: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const { t } = useI18n()
  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("Back to Settings")}
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <p className="text-xs text-muted-foreground">{t("Settings")}</p>
          <h2 className="text-lg font-semibold text-ink">{t(title)}</h2>
        </div>
      </div>
      <section className="page-card space-y-5 p-4">{children}</section>
    </>
  )
}

function MenuRow({
  icon,
  title,
  detail,
  disabled = false,
  trailing,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  detail: string
  disabled?: boolean
  trailing?: React.ReactNode
  onClick: () => void
}): React.JSX.Element {
  const { t } = useI18n()
  return (
    <button
      type="button"
      className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{t(title)}</span>
        <span className="block truncate text-xs text-muted-foreground">{t(detail)}</span>
      </span>
      <span className="text-muted-foreground transition-transform group-hover:translate-x-0.5">
        {trailing ?? <ChevronRight className="h-4 w-4" />}
      </span>
    </button>
  )
}

function ModeButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string
  active: boolean
  disabled: boolean
  onClick: () => void
}): React.JSX.Element {
  const { t } = useI18n()
  return (
    <Button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      variant={active ? 'default' : 'ghost'}
      size="sm"
      className={active ? 'font-semibold' : 'text-muted-foreground'}
    >
      {t(label)}
    </Button>
  )
}

function NumberSetting({
  label,
  hint,
  value,
  min,
  max,
  disabled,
  onChange,
  onCommit,
}: {
  label: string
  hint?: string
  value: string
  min: number
  max?: number
  disabled: boolean
  onChange: (value: string) => void
  onCommit: () => void
}): React.JSX.Element {
  const { t } = useI18n()
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-ink">{t(label)}</span>
      <Input
        type="number"
        min={min}
        max={max}
        step={1}
        className="max-w-[160px]"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onCommit()
        }}
      />
      {hint && <span className="mt-1 block text-xs text-ink-dim">{t(hint)}</span>}
    </label>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  const { t } = useI18n()
  return (
    <section className="page-card space-y-4 p-4">
      <h3 className="section-label">{t(title)}</h3>
      {children}
    </section>
  )
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  disabled: boolean
  onChange: (value: boolean) => void
}): React.JSX.Element {
  const { t } = useI18n()
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <span>
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-foreground">
          {t(label)}
        </label>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{t(hint)}</span>
      </span>
      <Switch
        id={id}
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  )
}
