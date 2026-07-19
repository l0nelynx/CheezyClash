import Store from 'electron-store'
import { randomFillSync } from 'crypto'
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type ProfileMeta,
} from '../shared/types'

interface StoreSchema {
  settings: AppSettings
  profiles: ProfileMeta[]
  activeProfileId: string | null
  controllerSecret: string
  selections: Record<string, string>
  desktopHwid: string
}

export const store = new Store<StoreSchema>({
  name: 'cheezy-desktop',
  defaults: {
    settings: { ...DEFAULT_SETTINGS },
    profiles: [],
    activeProfileId: null,
    controllerSecret: '',
    selections: {},
    desktopHwid: '',
  },
})

/** Normalize legacy tunEnabled → connectionMode and keep tunEnabled in sync. */
export function normalizeSettings(raw: Partial<AppSettings>): AppSettings {
  const merged: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    accessControlRules: Array.isArray(raw.accessControlRules)
      ? raw.accessControlRules
      : DEFAULT_SETTINGS.accessControlRules,
  }

  if (raw.connectionMode === 'proxy' || raw.connectionMode === 'tun') {
    merged.connectionMode = raw.connectionMode
  } else if (typeof raw.tunEnabled === 'boolean') {
    merged.connectionMode = raw.tunEnabled ? 'tun' : 'proxy'
  }

  merged.tunEnabled = merged.connectionMode === 'tun'
  return merged
}

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

export function getOrCreateSecret(): string {
  let s = store.get('controllerSecret')
  if (!s) {
    s = cryptoRandom(24)
    store.set('controllerSecret', s)
  }
  return s
}

export function getSelections(): Record<string, string> {
  return { ...store.get('selections') }
}

export function setSelection(group: string, proxy: string): void {
  const next = { ...store.get('selections'), [group]: proxy }
  store.set('selections', next)
}

function cryptoRandom(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let out = ''
  const arr = new Uint8Array(len)
  randomFillSync(arr)
  for (let i = 0; i < len; i++) out += chars[arr[i]! % chars.length]
  return out
}
