import type { PrivateSubscriptionInfo } from '../shared/private-api'
import { getPrivateModule } from './private-module'
import { upsertManagedProfile } from './profiles'
import { log } from './logger'
import type { SubscriptionInfo } from '../shared/types'
import { notifyProfilesChanged } from './profile-events'
import { rescheduleSubscriptionUpdates } from './subscription-updater'

/** After login/sync: import every account-managed subscription as its own profile. */
export async function syncManagedFromPrivate(): Promise<PrivateSubscriptionInfo[]> {
  const mod = getPrivateModule()
  if (!mod.capabilities().supportsAuth) return []

  let infos: PrivateSubscriptionInfo[] = []
  try {
    if (typeof mod.syncSubscriptions === 'function') {
      infos = await mod.syncSubscriptions()
    } else {
      const info = await mod.syncSubscription()
      infos = info ? [info] : []
    }
  } catch (e) {
    log(`subscription sync failed: ${e}`, 'warn')
    try {
      const info = await mod.fetchSubscription()
      infos = info ? [info] : []
    } catch (e2) {
      log(`subscription fetch failed: ${e2}`, 'warn')
      return []
    }
  }

  for (const info of infos) {
    if (!info.url) continue
    const subMeta: SubscriptionInfo = {
      title: info.title,
      upload: info.upload ?? 0,
      download: info.download ?? 0,
      total: info.total ?? 0,
      expire: info.expire ?? 0,
    }

    await upsertManagedProfile(
      info.url,
      info.title || 'CheezyVPN',
      subMeta,
      info.managedId || 'primary',
    )
  }
  rescheduleSubscriptionUpdates()
  notifyProfilesChanged()
  return infos
}
