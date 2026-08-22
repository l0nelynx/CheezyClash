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
import { CONTROLLER_HOST, CONTROLLER_PORT } from '../../../shared/types'
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
  const [section, setSection] = useState<SettingsSection | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
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

  const openDashboard = () =>
    void window.cheezy.openExternal(`http://${CONTROLLER_HOST}:${CONTROLLER_PORT}/ui/`)
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
      <SettingsSubpage title="Application" onBack={() => setSection(null)}>
        <Toggle
          label="Launch at system startup"
          hint="Start quietly in the tray when you sign in to your computer"
          checked={settings.autoStart}
          disabled={busy}
          onChange={(value) => onPatch({ autoStart: value })}
        />
        <Toggle
          label="Connect when the app starts"
          hint="Connect the active profile after every manual or system launch"
          checked={settings.autoConnect}
          disabled={busy}
          onChange={(value) => onPatch({ autoConnect: value })}
        />
      </SettingsSubpage>
    ) : section === 'connection' ? (
      <SettingsSubpage title="Connection" onBack={() => setSection(null)}>
        <Toggle
          label="Override YAML network settings"
          hint="Use the Desktop mode, proxy, TUN, and network values instead of the profile YAML"
          checked={settings.networkOverrideEnabled}
          disabled={busy}
          onChange={(value) => onPatch({ networkOverrideEnabled: value })}
        />
        {!settings.networkOverrideEnabled && (
          <p className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-xs text-ink-dim">
            Network settings are controlled by the Provider. The saved Desktop values below are not
            applied.
          </p>
        )}
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Mode</p>
          <p className="mb-3 text-xs text-ink-dim">Applies when you connect.</p>
          <div
            className="inline-flex rounded-lg border border-surface-border p-0.5"
            role="radiogroup"
            aria-label="Connection mode"
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
          label="System proxy"
          hint="Route system traffic through the app while connected (Proxy mode)"
          checked={settings.systemProxy}
          disabled={networkLocked}
          onChange={(value) => onPatch({ systemProxy: value })}
        />
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink">TUN stack</span>
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
          label="TUN MTU"
          hint="576–9000; default 1500"
          value={mtuDraft}
          min={576}
          max={9000}
          disabled={networkLocked || mode !== 'tun'}
          onChange={setMtuDraft}
          onCommit={commitMtu}
        />
      </SettingsSubpage>
    ) : section === 'network' ? (
      <SettingsSubpage title="Network" onBack={() => setSection(null)}>
        <Toggle
          label="Allow LAN"
          hint="Let other devices on your network use this connection"
          checked={settings.allowLan}
          disabled={networkLocked}
          onChange={(value) => onPatch({ allowLan: value })}
        />
        <NumberSetting
          label="Port"
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
          label="Enable Mux.Cool"
          hint="Apply Xray-compatible multiplexing to every VLESS proxy without flow"
          checked={settings.xrayMuxEnabled}
          disabled={busy}
          onChange={(value) => onPatch({ xrayMuxEnabled: value })}
        />
        <NumberSetting
          label="Concurrency"
          hint="Active TCP streams per carrier after soft-grow; default 32"
          value={muxConcurrencyDraft}
          min={1}
          disabled={busy || !settings.xrayMuxEnabled}
          onChange={setMuxConcurrencyDraft}
          onCommit={commitMuxConcurrency}
        />
        <NumberSetting
          label="Max connections"
          hint="Soft-grow target + hard cap; 0 — pack-first / unlimited"
          value={muxMaxConnectionsDraft}
          min={0}
          disabled={busy || !settings.xrayMuxEnabled}
          onChange={setMuxMaxConnectionsDraft}
          onCommit={commitMuxMaxConnections}
        />
        <NumberSetting
          label="Max dials per minute"
          hint="New physical dial budget; 0 — unlimited"
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
            <h2 className="text-lg font-semibold text-ink">Settings</h2>
            <p className="text-sm text-muted-foreground">Application, connection, and routing.</p>
          </div>
          {supportsAuth && (
            <Section title="Account">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">
                    {session?.email || 'Not signed in'}
                  </p>
                  <p className="text-xs text-ink-dim">
                    {signedIn
                      ? session?.emailVerified === false
                        ? 'Email not verified'
                        : 'Account'
                      : 'Using a subscription imported from a link'}
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
                      Sync
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={busy}
                      onClick={onLogout}
                    >
                      Log out
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={onLogin}
                  >
                    Sign in
                  </Button>
                )}
              </div>
            </Section>
          )}
          <nav
            className="page-card divide-y divide-surface-border overflow-hidden"
            aria-label="Settings sections"
          >
            <MenuRow
              icon={<AppWindow className="h-4 w-4" />}
              title="Application"
              detail="Startup and automatic connection"
              onClick={() => setSection('application')}
            />
            <MenuRow
              icon={<PlugZap className="h-4 w-4" />}
              title="Connection"
              detail="Desktop override, mode, system proxy, and TUN"
              onClick={() => setSection('connection')}
            />
            <MenuRow
              icon={<Network className="h-4 w-4" />}
              title="Network"
              detail="LAN access and mixed proxy port"
              onClick={() => setSection('network')}
            />
            <MenuRow
              icon={<Shuffle className="h-4 w-4" />}
              title="Xray Mux"
              detail="Multiplexing limits for VLESS proxies"
              onClick={() => setSection('xrayMux')}
            />
            <MenuRow
              icon={<ListFilter className="h-4 w-4" />}
              title="Custom Rules"
              detail={
                ruleCount === 0 ? 'No rules' : `${ruleCount} rule${ruleCount === 1 ? '' : 's'}`
              }
              onClick={() => setRulesOpen(true)}
            />
            <MenuRow
              icon={<LayoutDashboard className="h-4 w-4" />}
              title="Dashboard"
              detail="Open the local Mihomo dashboard"
              disabled={busy || !status?.running}
              trailing={<ExternalLink className="h-4 w-4" />}
              onClick={openDashboard}
            />
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
  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Back to Settings"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <p className="text-xs text-muted-foreground">Settings</p>
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
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
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
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
      {label}
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
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-ink">{label}</span>
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
      {hint && <span className="mt-1 block text-xs text-ink-dim">{hint}</span>}
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
  return (
    <section className="page-card space-y-4 p-4">
      <h3 className="section-label">{title}</h3>
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
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <span>
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-foreground">
          {label}
        </label>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{hint}</span>
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
