import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import type {
  PrivateAccountSession,
  PrivateCapabilities,
  PrivateModule,
  PrivateSubscriptionInfo,
} from '../shared/private-api'
import { log } from './logger'

const openStub: PrivateModule = {
  capabilities: () => ({ supportsAuth: false, productName: 'CheezyClash' }),
  getSession: async () => null,
  login: async () => {
    throw new Error('Account login is not available in the open build')
  },
  logout: async () => undefined,
  fetchSubscription: async () => null,
  syncSubscription: async () => null,
}

let moduleImpl: PrivateModule = openStub

export function getPrivateModule(): PrivateModule {
  return moduleImpl
}

export function setPrivateModule(mod: PrivateModule): void {
  moduleImpl = mod
}

/**
 * Load proprietary overlay if present:
 * - CHEEZY_PRIVATE_ENTRY env (absolute path to JS module)
 * - resources/private/index.js when packaged
 * - private-overlay/index.js next to app in dev
 */
export function loadPrivateModule(): PrivateModule {
  const candidates: string[] = []
  if (process.env.CHEEZY_PRIVATE_ENTRY) {
    candidates.push(process.env.CHEEZY_PRIVATE_ENTRY)
  }
  if (app.isPackaged) {
    candidates.push(join(process.resourcesPath, 'private', 'index.js'))
  } else {
    candidates.push(join(app.getAppPath(), 'private-overlay', 'index.js'))
    // Sibling CheezyVPN overlay during local proprietary build
    candidates.push(
      join(app.getAppPath(), '..', '..', 'CheezyVPN', 'proprietary', 'desktop', 'dist', 'index.js'),
    )
  }

  for (const p of candidates) {
    if (!p || !existsSync(p)) continue
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const loaded = require(p) as { createModule?: () => PrivateModule; default?: PrivateModule }
      const mod = loaded.createModule?.() ?? loaded.default
      if (mod && typeof mod.login === 'function') {
        log(`private module loaded from ${p}`)
        moduleImpl = mod
        return moduleImpl
      }
    } catch (e) {
      log(`failed to load private module ${p}: ${e}`, 'warn')
    }
  }

  moduleImpl = openStub
  return moduleImpl
}

export type {
  PrivateAccountSession,
  PrivateCapabilities,
  PrivateModule,
  PrivateSubscriptionInfo,
}
