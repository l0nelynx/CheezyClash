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

export function getSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...store.get('settings') }
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
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

function cryptoRandom(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let out = ''
  const arr = new Uint8Array(len)
  randomFillSync(arr)
  for (let i = 0; i < len; i++) out += chars[arr[i]! % chars.length]
  return out
}
