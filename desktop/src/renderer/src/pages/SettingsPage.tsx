import type { AppSettings } from '../../../shared/types'
import type { PrivateAccountSession } from '../../../shared/private-api'

interface Props {
  settings: AppSettings
  busy: boolean
  session: PrivateAccountSession | null
  supportsAuth: boolean
  onPatch: (patch: Partial<AppSettings>) => void
  onTunPrefer: (enabled: boolean) => void
  onLogout: () => void
  onSyncSubscription: () => void
}

export function SettingsPage({
  settings,
  busy,
  session,
  supportsAuth,
  onPatch,
  onTunPrefer,
  onLogout,
  onSyncSubscription,
}: Props): React.JSX.Element {
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">Settings</h2>
        <p className="text-sm text-ink-muted">Proxy ports and TUN preferences.</p>
      </div>

      {supportsAuth && (
        <Section title="Account">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">{session?.email || 'Signed in'}</p>
              <p className="text-xs text-ink-dim">
                {session?.emailVerified === false ? 'Email not verified' : 'CheezyVPN account'}
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

      <Section title="Network">
        <Toggle
          label="System proxy"
          hint="Point OS proxy at mixed-port while connected"
          checked={settings.systemProxy}
          disabled={busy}
          onChange={(v) => onPatch({ systemProxy: v })}
        />
        <Toggle
          label="Allow LAN"
          hint="Expose mixed-port to local network"
          checked={settings.allowLan}
          disabled={busy}
          onChange={(v) => onPatch({ allowLan: v })}
        />
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink">Mixed port</span>
          <input
            type="number"
            className="field max-w-[160px]"
            value={settings.mixedPort}
            disabled={busy}
            onChange={(e) => onPatch({ mixedPort: Number(e.target.value) || 7890 })}
          />
        </label>
      </Section>

      <Section title="TUN">
        <Toggle
          label="Prefer TUN on connect"
          hint="Use system TUN mode when available"
          checked={settings.tunEnabled}
          disabled={busy}
          onChange={onTunPrefer}
        />
        <label className="block">
          <span className="mb-1.5 block text-sm text-ink">TUN stack</span>
          <select
            className="field max-w-[200px]"
            value={settings.tunStack}
            disabled={busy}
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
    </div>
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
