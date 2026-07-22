import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { AccessControlRule, AppSettings, ConnectionMode, CoreStatus } from '../../../shared/types'
import type { PrivateAccountSession } from '../../../shared/private-api'
import { CONTROLLER_HOST, CONTROLLER_PORT } from '../../../shared/types'
import { AccessControlModal } from '../components/AccessControlModal'

interface Props {
  settings: AppSettings
  busy: boolean
  session: PrivateAccountSession | null
  supportsAuth: boolean
  status: CoreStatus | null
  onPatch: (patch: Partial<AppSettings>) => void
  onConnectionMode: (mode: ConnectionMode) => void
  onAccessControlChange: (rules: AccessControlRule[]) => Promise<void> | void
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
  onLogout,
  onSyncSubscription,
}: Props): React.JSX.Element {
  const [acOpen, setAcOpen] = useState(false)
  const [portDraft, setPortDraft] = useState(String(settings.mixedPort))

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

  useEffect(() => {
    setPortDraft(String(settings.mixedPort))
  }, [settings.mixedPort])

  const mode = settings.connectionMode ?? (settings.tunEnabled ? 'tun' : 'proxy')
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
              <p className="text-sm font-medium text-ink">{session?.email || 'Signed in'}</p>
              <p className="text-xs text-ink-dim">
                {session?.emailVerified === false ? 'Email not verified' : 'Account'}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn text-xs" disabled={busy} onClick={onSyncSubscription}>
                Sync
              </button>
              <button type="button" className="btn-danger text-xs" disabled={busy} onClick={onLogout}>
                Log out
              </button>
            </div>
          </div>
        </Section>
      )}

      <Section title="Connection">
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
              disabled={busy}
              onClick={() => onConnectionMode('proxy')}
            />
            <ModeButton
              label="TUN"
              active={mode === 'tun'}
              disabled={busy}
              onClick={() => onConnectionMode('tun')}
            />
          </div>
        </div>
        <Toggle
          label="System proxy"
          hint="Route system traffic through the app while connected (Proxy mode)"
          checked={settings.systemProxy}
          disabled={busy}
          onChange={(v) => onPatch({ systemProxy: v })}
        />
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink">TUN stack</span>
          <select
            className="field max-w-[200px]"
            value={settings.tunStack}
            disabled={busy || mode !== 'tun'}
            onChange={(e) =>
              onPatch({ tunStack: e.target.value as AppSettings['tunStack'] })
            }
          >
            <option value="mixed">mixed</option>
            <option value="system">system</option>
            <option value="gvisor">gvisor</option>
          </select>
        </label>
      </Section>

      <Section title="Network">
        <Toggle
          label="Allow LAN"
          hint="Let other devices on your network use this connection"
          checked={settings.allowLan}
          disabled={busy}
          onChange={(v) => onPatch({ allowLan: v })}
        />
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink">Port</span>
          <input
            type="number"
            className="field max-w-[160px]"
            value={portDraft}
            disabled={busy}
            onChange={(e) => setPortDraft(e.target.value)}
            onBlur={commitPort}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitPort()
            }}
          />
        </label>
      </Section>

      <Section title="Access Control">
        <p className="text-xs text-ink-dim">Block or bypass apps by name.</p>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink">
            {ruleCount === 0 ? 'No rules' : `${ruleCount} rule${ruleCount === 1 ? '' : 's'}`}
          </p>
          <button type="button" className="btn text-sm" disabled={busy} onClick={() => setAcOpen(true)}>
            Manage
          </button>
        </div>
      </Section>

      <Section title="Dashboard">
        <p className="text-xs text-ink-dim">Open the local Mihomo dashboard (connect first).</p>
        <button
          type="button"
          className="btn inline-flex items-center gap-1.5 text-sm"
          disabled={busy || !status?.running}
          onClick={openDashboard}
        >
          Open dashboard
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
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
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-primary font-semibold text-primary-foreground'
          : 'text-muted-foreground hover:text-ink'
      }`}
    >
      {label}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="space-y-4 rounded-xl border border-surface-border bg-surface-raised p-4">
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
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-ink-dim">{hint}</span>
      </span>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-surface-border accent-accent"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}
