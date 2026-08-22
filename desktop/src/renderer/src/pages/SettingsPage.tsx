import { useEffect, useId, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { AccessControlRule, AppSettings, ConnectionMode, CoreStatus } from '../../../shared/types'
import type { PrivateAccountSession } from '../../../shared/private-api'
import { CONTROLLER_HOST, CONTROLLER_PORT } from '../../../shared/types'
import { AccessControlModal } from '../components/AccessControlModal'
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

interface Props {
  settings: AppSettings
  busy: boolean
  session: PrivateAccountSession | null
  supportsAuth: boolean
  status: CoreStatus | null
  onPatch: (patch: Partial<AppSettings>) => void
  onConnectionMode: (mode: ConnectionMode) => void
  onAccessControlChange: (rules: AccessControlRule[]) => Promise<void> | void
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
  onAccessControlChange,
  onLogin,
  onLogout,
  onSyncSubscription,
}: Props): React.JSX.Element {
  const [acOpen, setAcOpen] = useState(false)
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

  const openDashboard = () => {
    void window.cheezy.openExternal(`http://${CONTROLLER_HOST}:${CONTROLLER_PORT}/ui/`)
  }

  const commitPort = (): void => {
    const next = Number(portDraft)
    if (!Number.isFinite(next) || next < 1024 || next > 65535) {
      setPortDraft(String(settings.mixedPort))
      return
    }
    if (next !== settings.mixedPort) onPatch({ mixedPort: next })
  }

  const commitMtu = (): void => {
    const next = Number(mtuDraft)
    if (!Number.isInteger(next) || next < 576 || next > 9000) {
      setMtuDraft(String(settings.tunMtu))
      return
    }
    if (next !== settings.tunMtu) onPatch({ tunMtu: next })
  }

  const commitMuxConcurrency = (): void => {
    const next = Number(muxConcurrencyDraft)
    if (!Number.isInteger(next) || next < 1) {
      setMuxConcurrencyDraft(String(settings.xrayMuxConcurrency))
      return
    }
    if (next !== settings.xrayMuxConcurrency) onPatch({ xrayMuxConcurrency: next })
  }

  const commitMuxMaxConnections = (): void => {
    const next = Number(muxMaxConnectionsDraft)
    if (!Number.isInteger(next) || next < 0) {
      setMuxMaxConnectionsDraft(String(settings.xrayMuxMaxConnections))
      return
    }
    if (next !== settings.xrayMuxMaxConnections) onPatch({ xrayMuxMaxConnections: next })
  }

  const commitMuxMaxDials = (): void => {
    const next = Number(muxMaxDialsDraft)
    if (!Number.isInteger(next) || next < 0) {
      setMuxMaxDialsDraft(String(settings.xrayMuxMaxDialsPerMinute))
      return
    }
    if (next !== settings.xrayMuxMaxDialsPerMinute) onPatch({ xrayMuxMaxDialsPerMinute: next })
  }

  useEffect(() => {
    setPortDraft(String(settings.mixedPort))
  }, [settings.mixedPort])

  useEffect(() => {
    setMtuDraft(String(settings.tunMtu))
  }, [settings.tunMtu])

  useEffect(() => {
    setMuxConcurrencyDraft(String(settings.xrayMuxConcurrency))
  }, [settings.xrayMuxConcurrency])

  useEffect(() => {
    setMuxMaxConnectionsDraft(String(settings.xrayMuxMaxConnections))
  }, [settings.xrayMuxMaxConnections])

  useEffect(() => {
    setMuxMaxDialsDraft(String(settings.xrayMuxMaxDialsPerMinute))
  }, [settings.xrayMuxMaxDialsPerMinute])

  const mode = settings.connectionMode ?? (settings.tunEnabled ? 'tun' : 'proxy')
  const signedIn = !!session?.email
  const networkLocked = busy || !settings.networkOverrideEnabled
  const ruleCount = settings.accessControlRules?.length ?? 0

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">Settings</h2>
        <p className="text-sm text-muted-foreground">Connection, network, and app rules.</p>
      </div>

      {supportsAuth && (
        <Section title="Account">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">{session?.email || 'Not signed in'}</p>
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
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onSyncSubscription}>
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
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onLogin}>
                Sign in
              </Button>
            )}
          </div>
        </Section>
      )}

      <Section title="Application">
        <Toggle
          label="Launch at system startup"
          hint="Start quietly in the tray when you sign in to your computer"
          checked={settings.autoStart}
          disabled={busy}
          onChange={(v) => onPatch({ autoStart: v })}
        />
        <Toggle
          label="Connect when the app starts"
          hint="Connect the active profile after every manual or system launch"
          checked={settings.autoConnect}
          disabled={busy}
          onChange={(v) => onPatch({ autoConnect: v })}
        />
      </Section>

      <Section title="Connection">
        <Toggle
          label="Override YAML network settings"
          hint="Use the Desktop mode, proxy, TUN, and network values instead of the profile YAML"
          checked={settings.networkOverrideEnabled}
          disabled={busy}
          onChange={(v) => onPatch({ networkOverrideEnabled: v })}
        />
        {!settings.networkOverrideEnabled && (
          <p className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-xs text-ink-dim">
            Network settings are controlled by the Provider. The saved Desktop values below are
            not applied.
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
          onChange={(v) => onPatch({ systemProxy: v })}
        />
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink">TUN stack</span>
          <Select
            value={settings.tunStack}
            disabled={networkLocked || mode !== 'tun'}
            onValueChange={(value) =>
              onPatch({ tunStack: value as AppSettings['tunStack'] })
            }
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
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink">TUN MTU</span>
          <Input
            type="number"
            min={576}
            max={9000}
            step={1}
            className="max-w-[160px]"
            value={mtuDraft}
            disabled={networkLocked || mode !== 'tun'}
            onChange={(e) => setMtuDraft(e.target.value)}
            onBlur={commitMtu}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitMtu()
            }}
          />
          <span className="mt-1 block text-xs text-ink-dim">576–9000; default 1500</span>
        </label>
      </Section>

      <Section title="Network">
        <Toggle
          label="Allow LAN"
          hint="Let other devices on your network use this connection"
          checked={settings.allowLan}
          disabled={networkLocked}
          onChange={(v) => onPatch({ allowLan: v })}
        />
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink">Port</span>
          <Input
            type="number"
            className="max-w-[160px]"
            value={portDraft}
            disabled={networkLocked}
            onChange={(e) => setPortDraft(e.target.value)}
            onBlur={commitPort}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitPort()
            }}
          />
        </label>
      </Section>

      <Section title="Xray Mux">
        <Toggle
          label="Enable Mux.Cool"
          hint="Apply Xray-compatible multiplexing to every VLESS proxy without flow"
          checked={settings.xrayMuxEnabled}
          disabled={busy}
          onChange={(v) => onPatch({ xrayMuxEnabled: v })}
        />
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink">Concurrency</span>
          <Input
            type="number"
            min={1}
            step={1}
            className="max-w-[160px]"
            value={muxConcurrencyDraft}
            disabled={busy || !settings.xrayMuxEnabled}
            onChange={(e) => setMuxConcurrencyDraft(e.target.value)}
            onBlur={commitMuxConcurrency}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitMuxConcurrency()
            }}
          />
          <span className="mt-1 block text-xs text-ink-dim">
            Active TCP streams per carrier after soft-grow; default 32
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink">Max connections</span>
          <Input
            type="number"
            min={0}
            step={1}
            className="max-w-[160px]"
            value={muxMaxConnectionsDraft}
            disabled={busy || !settings.xrayMuxEnabled}
            onChange={(e) => setMuxMaxConnectionsDraft(e.target.value)}
            onBlur={commitMuxMaxConnections}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitMuxMaxConnections()
            }}
          />
          <span className="mt-1 block text-xs text-ink-dim">
            Soft-grow target + hard cap; 0 — pack-first / unlimited
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink">Max dials per minute</span>
          <Input
            type="number"
            min={0}
            step={1}
            className="max-w-[160px]"
            value={muxMaxDialsDraft}
            disabled={busy || !settings.xrayMuxEnabled}
            onChange={(e) => setMuxMaxDialsDraft(e.target.value)}
            onBlur={commitMuxMaxDials}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitMuxMaxDials()
            }}
          />
          <span className="mt-1 block text-xs text-ink-dim">
            New physical dial budget; 0 — unlimited
          </span>
        </label>
      </Section>

      <Section title="Access Control">
        <p className="text-xs text-ink-dim">Block or bypass apps by name.</p>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink">
            {ruleCount === 0 ? 'No rules' : `${ruleCount} rule${ruleCount === 1 ? '' : 's'}`}
          </p>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setAcOpen(true)}>
            Manage
          </Button>
        </div>
      </Section>

      <Section title="Dashboard">
        <p className="text-xs text-ink-dim">Open the local Mihomo dashboard (connect first).</p>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !status?.running}
          onClick={openDashboard}
        >
          Open dashboard
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </Section>

      <AccessControlModal
        open={acOpen}
        rules={settings.accessControlRules ?? []}
        busy={busy}
        onClose={() => setAcOpen(false)}
        onSave={onAccessControlChange}
      />
    </div>
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

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
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
  onChange: (v: boolean) => void
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
