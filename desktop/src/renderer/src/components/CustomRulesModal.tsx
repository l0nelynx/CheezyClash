import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  FileSearch,
  FolderOpen,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import type { CustomRule, CustomRuleContext, CustomRuleType } from '../../../shared/custom-rules'
import {
  clashToPolicyLabel,
  CUSTOM_RULE_TYPES,
  customRuleAvailability,
  customRuleDefinition,
} from '../../../shared/custom-rules'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Switch } from './ui/switch'

interface Props {
  open: boolean
  rules: CustomRule[]
  busy: boolean
  onClose: () => void
  onSave: (rules: CustomRule[]) => Promise<void> | void
}

const BUILTIN_POLICIES = ['DIRECT', 'PROXY', 'BLOCK'] as const
const EMPTY_CONTEXT: CustomRuleContext = {
  proxyGroups: [],
  proxyNames: [],
  ruleSets: [],
  subRules: [],
  profileId: null,
  resolvedProxyTarget: null,
  activeProfileId: null,
  profiles: [],
  platform: 'windows',
}

function initialAction(type: CustomRuleType, context: CustomRuleContext): string {
  return type === 'SUB-RULE' ? (context.subRules[0] ?? '') : 'DIRECT'
}

export function CustomRulesModal({
  open,
  rules,
  busy,
  onClose,
  onSave,
}: Props): React.JSX.Element | null {
  const [localRules, setLocalRules] = useState<CustomRule[]>(rules)
  const [context, setContext] = useState<CustomRuleContext>(EMPTY_CONTEXT)
  const [type, setType] = useState<CustomRuleType>('PROCESS-NAME')
  const [payload, setPayload] = useState('')
  const [action, setAction] = useState('DIRECT')
  const [noResolve, setNoResolve] = useState(false)
  const [profileIds, setProfileIds] = useState<string[] | null>(null)
  const [processes, setProcesses] = useState<{ name: string; pid: number }[]>([])
  const [loadingContext, setLoadingContext] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const definition = customRuleDefinition(type)
  const disabled = busy || saving
  const enabledCount = localRules.filter((rule) => rule.enabled).length

  useEffect(() => {
    if (!open) return
    setLocalRules(rules)
  }, [open, rules])

  useEffect(() => {
    if (!open) return
    setType('PROCESS-NAME')
    setPayload('')
    setAction('DIRECT')
    setNoResolve(false)
    setProfileIds(null)
    setEditingId(null)
    setDraggingId(null)
    setError(null)
    setLoadingContext(true)
    void Promise.all([window.cheezy.getCustomRuleContext(), window.cheezy.listProcesses()])
      .then(([nextContext, nextProcesses]) => {
        setContext(nextContext)
        setProcesses(nextProcesses)
      })
      .catch(() => {
        setContext(EMPTY_CONTEXT)
        setProcesses([])
      })
      .finally(() => setLoadingContext(false))
    requestAnimationFrame(() => closeRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !disabled) {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, disabled, onClose])

  const policyOptions = useMemo(() => {
    const options = new Set<string>([...BUILTIN_POLICIES, ...context.proxyGroups])
    if (type !== 'SUB-RULE' && action) options.add(clashToPolicyLabel(action))
    return [...options]
  }, [action, context.proxyGroups, type])

  if (!open) return null

  const resetForm = (): void => {
    setType('PROCESS-NAME')
    setPayload('')
    setAction('DIRECT')
    setNoResolve(false)
    setProfileIds(null)
    setEditingId(null)
    setError(null)
  }

  const changeType = (nextType: CustomRuleType): void => {
    setType(nextType)
    setPayload(
      nextType === 'NETWORK' ? 'tcp' : nextType === 'RULE-SET' ? (context.ruleSets[0] ?? '') : '',
    )
    setAction(initialAction(nextType, context))
    setNoResolve(false)
    if (
      !editingId &&
      (nextType === 'RULE-SET' || nextType === 'SUB-RULE') &&
      context.activeProfileId
    ) {
      setProfileIds([context.activeProfileId])
    }
    setError(null)
  }

  const changeAction = (nextAction: string): void => {
    setAction(nextAction)
    if (
      !editingId &&
      !BUILTIN_POLICIES.includes(nextAction as (typeof BUILTIN_POLICIES)[number]) &&
      context.activeProfileId
    ) {
      setProfileIds([context.activeProfileId])
    }
  }

  const startEdit = (rule: CustomRule): void => {
    setEditingId(rule.id)
    setType(rule.type)
    setPayload(rule.payload)
    setAction(clashToPolicyLabel(rule.action))
    setNoResolve(rule.noResolve)
    setProfileIds(rule.profileIds === null ? null : [...rule.profileIds])
    setError(null)
    dialogRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const persist = async (next: CustomRule[]): Promise<boolean> => {
    setSaving(true)
    setError(null)
    try {
      await onSave(next)
      setLocalRules(next)
      return true
    } catch (cause) {
      setError(String(cause instanceof Error ? cause.message : cause))
      return false
    } finally {
      setSaving(false)
    }
  }

  const applyRule = async (): Promise<void> => {
    const nextRule: CustomRule = {
      id: editingId ?? crypto.randomUUID(),
      type,
      payload: definition.noPayload ? '' : payload.trim(),
      action: action === 'BLOCK' ? 'REJECT' : action.trim(),
      enabled: editingId
        ? (localRules.find((rule) => rule.id === editingId)?.enabled ?? true)
        : true,
      noResolve: definition.noResolve === true && noResolve,
      profileIds,
    }
    try {
      await window.cheezy.validateCustomRule(nextRule)
    } catch (cause) {
      setError(String(cause instanceof Error ? cause.message : cause))
      return
    }
    const next = editingId
      ? localRules.map((rule) => (rule.id === editingId ? nextRule : rule))
      : [...localRules, nextRule]
    if (await persist(next)) resetForm()
  }

  const removeRule = async (id: string): Promise<void> => {
    const next = localRules.filter((rule) => rule.id !== id)
    if (await persist(next)) {
      if (editingId === id) resetForm()
    }
  }

  const toggleRule = async (id: string, enabled: boolean): Promise<void> => {
    await persist(localRules.map((rule) => (rule.id === id ? { ...rule, enabled } : rule)))
  }

  const moveRule = async (id: string, targetIndex: number): Promise<void> => {
    const fromIndex = localRules.findIndex((rule) => rule.id === id)
    if (fromIndex < 0) return
    const boundedTarget = Math.max(0, Math.min(localRules.length - 1, targetIndex))
    if (fromIndex === boundedTarget) return
    const next = [...localRules]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(boundedTarget, 0, moved!)
    await persist(next)
  }

  const pickPath = async (kind: 'file' | 'directory'): Promise<void> => {
    const picked = await window.cheezy.pickProcessPath(kind)
    if (!picked) return
    if (kind === 'file') {
      setType('PROCESS-PATH')
      setPayload(picked)
      return
    }
    const separator = context.platform === 'windows' ? '\\' : '/'
    setType('PROCESS-PATH-WILDCARD')
    setPayload(`${picked.replace(/[\\/]+$/, '')}${separator}*`)
  }

  const ruleSetOptions =
    payload && !context.ruleSets.includes(payload)
      ? [payload, ...context.ruleSets]
      : context.ruleSets
  const subRuleOptions =
    action && !context.subRules.includes(action) ? [action, ...context.subRules] : context.subRules

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !disabled) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-rules-title"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 id="custom-rules-title" className="text-lg font-semibold text-foreground">
              Custom Rules
            </h2>
            <p className="text-xs text-muted-foreground">
              {localRules.length === 0
                ? 'Enabled rules are added before profile rules.'
                : `${enabledCount} of ${localRules.length} enabled · highest priority first`}
            </p>
          </div>
          <Button
            ref={closeRef}
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={disabled}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4">
          <div className="space-y-4 rounded-xl border border-border bg-background/35 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-foreground">
                  Rule type{editingId ? ' (editing)' : ''}
                </span>
                <select
                  className="field w-full"
                  value={type}
                  disabled={disabled}
                  onChange={(event) => changeType(event.target.value as CustomRuleType)}
                >
                  {(['Domain', 'IP', 'Ports & inbound', 'Process', 'Other'] as const).map(
                    (category) => (
                      <optgroup key={category} label={category}>
                        {CUSTOM_RULE_TYPES.filter(
                          (candidate) => customRuleDefinition(candidate).category === category,
                        ).map((candidate) => (
                          <option key={candidate} value={candidate}>
                            {candidate}
                          </option>
                        ))}
                      </optgroup>
                    ),
                  )}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-foreground">
                  {type === 'SUB-RULE' ? 'Sub-rule' : 'Policy'}
                </span>
                <select
                  className="field w-full"
                  value={action}
                  disabled={disabled || (type === 'SUB-RULE' && context.subRules.length === 0)}
                  onChange={(event) => changeAction(event.target.value)}
                >
                  {(type === 'SUB-RULE' ? subRuleOptions : policyOptions).length === 0 && (
                    <option value="">No sub-rules in this profile</option>
                  )}
                  {(type === 'SUB-RULE' ? subRuleOptions : policyOptions).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rounded-lg border border-border bg-card/45 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Profiles</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Apply universally or only while selected profiles are active.
                  </p>
                </div>
                <div className="flex rounded-lg border border-border bg-background p-0.5">
                  <button
                    type="button"
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      profileIds === null
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    disabled={disabled}
                    onClick={() => setProfileIds(null)}
                  >
                    All profiles
                  </button>
                  <button
                    type="button"
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      profileIds !== null
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    disabled={disabled}
                    onClick={() =>
                      setProfileIds(
                        profileIds ?? (context.activeProfileId ? [context.activeProfileId] : []),
                      )
                    }
                  >
                    Selected
                  </button>
                </div>
              </div>
              {profileIds !== null && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {context.profiles.length === 0 ? (
                    <p className="text-xs text-amber-300">No profiles are available.</p>
                  ) : (
                    context.profiles.map((profile) => (
                      <label
                        key={profile.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-2 text-xs text-foreground"
                      >
                        <input
                          type="checkbox"
                          className="accent-primary"
                          checked={profileIds.includes(profile.id)}
                          disabled={disabled}
                          onChange={(event) =>
                            setProfileIds((current) => {
                              const selected = current ?? []
                              return event.target.checked
                                ? [...new Set([...selected, profile.id])]
                                : selected.filter((id) => id !== profile.id)
                            })
                          }
                        />
                        <span className="truncate" title={profile.name}>
                          {profile.name}
                          {profile.id === context.activeProfileId ? ' · active' : ''}
                        </span>
                      </label>
                    ))
                  )}
                  {profileIds
                    .filter((id) => !context.profiles.some((profile) => profile.id === id))
                    .map((id) => (
                      <label
                        key={id}
                        className="flex cursor-pointer items-center gap-2 rounded-md border border-amber-500/35 px-2.5 py-2 text-xs text-amber-300"
                      >
                        <input
                          type="checkbox"
                          className="accent-primary"
                          checked
                          disabled={disabled}
                          onChange={() =>
                            setProfileIds(
                              (current) => current?.filter((value) => value !== id) ?? [],
                            )
                          }
                        />
                        <span className="truncate" title={id}>
                          Unavailable profile · {id}
                        </span>
                      </label>
                    ))}
                </div>
              )}
            </div>

            {!definition.noPayload && (
              <div>
                <label
                  htmlFor="custom-rule-payload"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  {definition.targetLabel}
                </label>
                {type === 'RULE-SET' ? (
                  <select
                    id="custom-rule-payload"
                    className="field w-full"
                    value={payload}
                    disabled={disabled || context.ruleSets.length === 0}
                    onChange={(event) => setPayload(event.target.value)}
                  >
                    {ruleSetOptions.length === 0 && (
                      <option value="">No rule-providers in this profile</option>
                    )}
                    {ruleSetOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : type === 'NETWORK' ? (
                  <select
                    id="custom-rule-payload"
                    className="field w-full"
                    value={payload || 'tcp'}
                    disabled={disabled}
                    onChange={(event) => setPayload(event.target.value)}
                  >
                    <option value="tcp">tcp</option>
                    <option value="udp">udp</option>
                  </select>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Input
                      id="custom-rule-payload"
                      className="min-w-[220px] flex-1"
                      value={payload}
                      placeholder={definition.placeholder}
                      disabled={disabled}
                      onChange={(event) => setPayload(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void applyRule()
                      }}
                    />
                    {type === 'PROCESS-PATH' && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={disabled}
                          onClick={() => void pickPath('file')}
                        >
                          <FileSearch className="h-4 w-4" />
                          Choose file
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={disabled}
                          onClick={() => void pickPath('directory')}
                        >
                          <FolderOpen className="h-4 w-4" />
                          Choose folder
                        </Button>
                      </>
                    )}
                  </div>
                )}
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {definition.hint}
                </p>

                {type === 'PROCESS-NAME' && (
                  <label className="mt-3 block">
                    <span className="mb-1.5 block text-xs text-muted-foreground">
                      Running processes
                    </span>
                    <select
                      className="field w-full"
                      value=""
                      disabled={disabled || loadingContext}
                      onChange={(event) => {
                        if (event.target.value) setPayload(event.target.value)
                      }}
                    >
                      <option value="">
                        {loadingContext
                          ? 'Loading…'
                          : processes.length
                            ? 'Pick a running process…'
                            : 'No processes found'}
                      </option>
                      {processes.map((process) => (
                        <option key={`${process.name}-${process.pid}`} value={process.name}>
                          {process.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}

            {definition.noResolve && (
              <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card px-3 py-2.5">
                <div>
                  <label
                    htmlFor="custom-rule-no-resolve"
                    className="text-sm font-medium text-foreground"
                  >
                    no-resolve
                  </label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Do not resolve a domain to test its target IP.
                  </p>
                </div>
                <Switch
                  id="custom-rule-no-resolve"
                  checked={noResolve}
                  disabled={disabled}
                  onCheckedChange={setNoResolve}
                />
              </div>
            )}

            {definition.noPayload && (
              <div className="flex gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{definition.hint}</span>
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                className="min-w-0 flex-1"
                disabled={disabled}
                onClick={() => void applyRule()}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {editingId ? 'Update rule' : 'Add rule'}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" disabled={disabled} onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Saved rules
              </p>
              {localRules.length > 1 && (
                <p className="text-xs text-muted-foreground">Drag to change priority</p>
              )}
            </div>
            {localRules.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground">
                No custom rules yet. Choose a type above to add one.
              </div>
            ) : (
              <ul className="space-y-2">
                {localRules.map((rule, index) => {
                  const availability = customRuleAvailability(rule, context)
                  const available = availability.kind === 'available'
                  const displayAction = clashToPolicyLabel(rule.action)
                  const scopedProfileNames =
                    rule.profileIds === null
                      ? []
                      : rule.profileIds.map(
                          (id) => context.profiles.find((profile) => profile.id === id)?.name ?? id,
                        )
                  return (
                    <li
                      key={rule.id}
                      className={`flex items-center gap-2 rounded-xl border px-2.5 py-2.5 transition-colors ${
                        draggingId === rule.id
                          ? 'border-primary bg-primary/10'
                          : editingId === rule.id
                            ? 'border-primary/60 bg-primary/5'
                            : 'border-border bg-background/30'
                      } ${rule.enabled ? '' : 'opacity-55'}`}
                      onDragOver={(event) => {
                        if (draggingId && draggingId !== rule.id) event.preventDefault()
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        if (draggingId) void moveRule(draggingId, index)
                        setDraggingId(null)
                      }}
                    >
                      <button
                        type="button"
                        draggable={!disabled}
                        className="btn-ghost shrink-0 cursor-grab p-1.5 active:cursor-grabbing"
                        disabled={disabled}
                        aria-label={`Move ${rule.type} rule. Alt plus arrow keys changes priority.`}
                        onDragStart={(event) => {
                          setDraggingId(rule.id)
                          event.dataTransfer.effectAllowed = 'move'
                          event.dataTransfer.setData('text/plain', rule.id)
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        onKeyDown={(event) => {
                          if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return
                          event.preventDefault()
                          void moveRule(rule.id, index + (event.key === 'ArrowUp' ? -1 : 1))
                        }}
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <Switch
                        checked={rule.enabled}
                        disabled={disabled}
                        onCheckedChange={(enabled) => void toggleRule(rule.id, enabled)}
                        aria-label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.type} rule`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-xs font-semibold text-muted-foreground">
                            {rule.type}
                          </span>
                          {!available && (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                              {availability.kind === 'out-of-scope'
                                ? 'Out of scope'
                                : 'Unavailable'}
                            </span>
                          )}
                          {rule.noResolve && (
                            <span className="text-[10px] text-muted-foreground">no-resolve</span>
                          )}
                        </div>
                        <p
                          className="truncate text-sm text-foreground"
                          title={`${rule.payload || 'All traffic'} → ${displayAction}`}
                        >
                          <span className="font-medium">{rule.payload || 'All traffic'}</span>
                          <span className="text-muted-foreground"> → {displayAction}</span>
                          {rule.action === 'PROXY' && availability.kind === 'available' && (
                            <span className="text-muted-foreground">
                              {' '}
                              ({availability.resolvedAction})
                            </span>
                          )}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {rule.profileIds === null
                            ? 'All profiles'
                            : scopedProfileNames.length === 1
                              ? scopedProfileNames[0]
                              : `${scopedProfileNames.length} selected profiles`}
                        </p>
                        {!available && (
                          <p className="truncate text-[11px] text-amber-300/90">
                            {availability.reason}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={disabled}
                          onClick={() => startEdit(rule)}
                          aria-label={`Edit ${rule.type} rule`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={disabled}
                          onClick={() => void removeRule(rule.id)}
                          aria-label={`Delete ${rule.type} rule`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
