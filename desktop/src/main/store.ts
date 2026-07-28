import Store from 'electron-store'
import { randomFillSync } from 'crypto'
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
  controllerSecret: string
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
    controllerSecret: '',
    selections: {},
    selectionsByProfile: {},
    desktopHwid: '',
    systemProxyOwned: false,
  },
})

export function getSettings(): AppSettings {
  return normalizeSettings(store.get('settings'))
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

export function getOrCreateSecret(): string {
  let s = store.get('controllerSecret')
  if (!s) {
    s = cryptoRandom(24)
    store.set('controllerSecret', s)
  }
  return s
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

function cryptoRandom(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let out = ''
  const arr = new Uint8Array(len)
  randomFillSync(arr)
  for (let i = 0; i < len; i++) out += chars[arr[i]! % chars.length]
  return out
}
