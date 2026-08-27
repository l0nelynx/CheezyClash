import Store from 'electron-store'
import type { ControllerRuntime } from './controller-config'
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AppSettings,
  type ProfileMeta,
} from '../shared/types'

export { normalizeSettings } from '../shared/types'

interface StoreSchema {
  settings: AppSettings
  profiles: ProfileMeta[]
  activeProfileId: string | null
  /** Snapshot of the controller actually started, not an override for profile YAML. */
  controllerRuntime: ControllerRuntime | null
  /** @deprecated migrated to selectionsByProfile */
  selections: Record<string, string>
  selectionsByProfile: Record<string, Record<string, string>>
  desktopHwid: string
  /** True only after this app successfully enabled the OS proxy. */
  systemProxyOwned: boolean
}

export const store = new Store<StoreSchema>({
  name: 'cheezy-desktop',
  defaults: {
    settings: { ...DEFAULT_SETTINGS },
    profiles: [],
    activeProfileId: null,
    controllerRuntime: null,
    selections: {},
    selectionsByProfile: {},
    desktopHwid: '',
    systemProxyOwned: false,
  },
})

export function getSettings(): AppSettings {
  const raw = store.get('settings') as AppSettings & {
    accessControlRules?: unknown[]
    customRules?: unknown[]
  }
  const normalized = normalizeSettings(raw)
  if (!Array.isArray(raw.customRules) && Array.isArray(raw.accessControlRules)) {
    store.set('settings', normalized)
  }
  return normalized
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const nextPatch = { ...patch }
  if (patch.connectionMode) {
    nextPatch.tunEnabled = patch.connectionMode === 'tun'
  } else if (typeof patch.tunEnabled === 'boolean' && patch.connectionMode === undefined) {
    nextPatch.connectionMode = patch.tunEnabled ? 'tun' : 'proxy'
  }
  const next = normalizeSettings({ ...current, ...nextPatch })
  store.set('settings', next)
  return next
}

export function isSystemProxyOwned(): boolean {
  return store.get('systemProxyOwned') === true
}

export function setSystemProxyOwned(owned: boolean): void {
  store.set('systemProxyOwned', owned)
}

function activeProfileIdForSelections(profileId?: string | null): string | null {
  return profileId ?? store.get('activeProfileId')
}

export function getSelections(profileId?: string | null): Record<string, string> {
  const id = activeProfileIdForSelections(profileId)
  if (!id) return {}

  const byProfile = { ...(store.get('selectionsByProfile') ?? {}) }
  if (byProfile[id]) return { ...byProfile[id]! }

  const legacy = store.get('selections')
  if (legacy && Object.keys(legacy).length > 0) {
    byProfile[id] = { ...legacy }
    store.set('selectionsByProfile', byProfile)
    store.set('selections', {})
    return { ...byProfile[id]! }
  }
  return {}
}

export function setSelection(group: string, proxy: string, profileId?: string | null): void {
  const id = activeProfileIdForSelections(profileId)
  if (!id) return
  const byProfile = { ...(store.get('selectionsByProfile') ?? {}) }
  byProfile[id] = { ...(byProfile[id] ?? {}), [group]: proxy }
  store.set('selectionsByProfile', byProfile)
}
