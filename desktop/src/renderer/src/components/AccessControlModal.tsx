import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { AccessControlRule } from '../../../shared/types'
import { clashToPolicyLabel } from '../../../shared/types'

interface Props {
  open: boolean
  rules: AccessControlRule[]
  busy: boolean
  onClose: () => void
  onSave: (rules: AccessControlRule[]) => Promise<void> | void
}

const BUILTIN_POLICIES = ['DIRECT', 'PROXY', 'BLOCK'] as const

export function AccessControlModal({
  open,
  rules,
  busy,
  onClose,
  onSave,
}: Props): React.JSX.Element | null {
  const [localRules, setLocalRules] = useState<AccessControlRule[]>(rules)
  const [processName, setProcessName] = useState('')
  const [policy, setPolicy] = useState<string>('DIRECT')
  const [groupNames, setGroupNames] = useState<string[]>([])
  const [processes, setProcesses] = useState<{ name: string; pid: number }[]>([])
  const [loadingProcs, setLoadingProcs] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setLocalRules(rules)
    setProcessName('')
    setPolicy('DIRECT')
    setEditingId(null)
    setError(null)
    void window.cheezy.getProxyGroupNames().then(setGroupNames).catch(() => setGroupNames([]))
    setLoadingProcs(true)
    void window.cheezy
      .listProcesses()
      .then(setProcesses)
      .catch(() => setProcesses([]))
      .finally(() => setLoadingProcs(false))
  }, [open, rules])

  const policyOptions = useMemo(() => {
    const set = new Set<string>([...BUILTIN_POLICIES, ...groupNames])
    return [...set]
  }, [groupNames])

  if (!open) return null

  const resetForm = (): void => {
    setProcessName('')
    setPolicy('DIRECT')
    setEditingId(null)
    setError(null)
  }

  const startEdit = (rule: AccessControlRule): void => {
    setEditingId(rule.id)
    setProcessName(rule.processName)
    setPolicy(clashToPolicyLabel(rule.policy))
    setError(null)
  }

  const applyRule = async (): Promise<void> => {
    setError(null)
    const name = processName.trim()
    if (!name) {
      setError('Enter a process name')
      return
    }
    try {
      await window.cheezy.validateAccessControlRule(name, policy)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
      return
    }

    const nextRule: AccessControlRule = {
      id: editingId ?? crypto.randomUUID(),
      processName: name,
      policy: policy === 'BLOCK' ? 'REJECT' : policy,
    }

    let next: AccessControlRule[]
    if (editingId) {
      next = localRules.map((r) => (r.id === editingId ? nextRule : r))
    } else {
      next = [...localRules, nextRule]
    }

    setSaving(true)
    try {
      await onSave(next)
      setLocalRules(next)
      resetForm()
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setSaving(false)
    }
  }

  const removeRule = async (id: string): Promise<void> => {
    setError(null)
    const next = localRules.filter((r) => r.id !== id)
    setSaving(true)
    try {
      await onSave(next)
      setLocalRules(next)
      if (editingId === id) resetForm()
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setSaving(false)
    }
  }

  const browseExe = async (): Promise<void> => {
    const picked = await window.cheezy.pickExecutable()
    if (picked) setProcessName(picked)
  }

  const disabled = busy || saving

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-surface-border bg-surface-raised shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ac-title"
      >
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <div>
            <h2 id="ac-title" className="text-lg font-semibold text-ink">
              Access Control
            </h2>
            <p className="text-xs text-ink-dim">PROCESS-NAME rules prepended to the active profile.</p>
          </div>
          <button type="button" className="btn-ghost p-2" onClick={onClose} disabled={disabled}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-ink">Process</label>
            <div className="flex gap-2">
              <input
                className="field flex-1"
                placeholder="Discord.exe"
                value={processName}
                disabled={disabled}
                onChange={(e) => setProcessName(e.target.value)}
              />
              <button type="button" className="btn shrink-0" disabled={disabled} onClick={() => void browseExe()}>
                <FolderOpen className="h-4 w-4" />
                Browse
              </button>
            </div>
            <label className="block text-xs text-ink-dim">Running processes</label>
            <select
              className="field w-full"
              disabled={disabled || loadingProcs}
              value=""
              onChange={(e) => {
                if (e.target.value) setProcessName(e.target.value)
              }}
            >
              <option value="">
                {loadingProcs ? 'Loading…' : processes.length ? 'Pick a running process…' : 'No processes'}
              </option>
              {processes.map((p) => (
                <option key={`${p.name}-${p.pid}`} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Rule</label>
            <select
              className="field w-full"
              value={policy}
              disabled={disabled}
              onChange={(e) => setPolicy(e.target.value)}
            >
              {policyOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="button"
            className="btn-primary w-full"
            disabled={disabled}
            onClick={() => void applyRule()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {editingId ? 'Update rule' : 'Add rule'}
          </button>

          <div className="border-t border-surface-border pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-dim">Rules</p>
            {localRules.length === 0 ? (
              <p className="text-sm text-ink-muted">No access control rules yet.</p>
            ) : (
              <ul className="space-y-2">
                {localRules.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-ink">
                      <span className="font-medium">{r.processName}</span>
                      <span className="text-ink-dim"> → {clashToPolicyLabel(r.policy)}</span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="btn-ghost p-1.5"
                        disabled={disabled}
                        onClick={() => startEdit(r)}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost p-1.5 text-danger"
                        disabled={disabled}
                        onClick={() => void removeRule(r.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
