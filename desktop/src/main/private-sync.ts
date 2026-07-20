import type { PrivateSubscriptionInfo } from '../shared/private-api'
import { getPrivateModule } from './private-module'
import { upsertManagedProfile } from './profiles'
import { log } from './logger'
import type { SubscriptionInfo } from '../shared/types'
import { notifyProfilesChanged } from './profile-events'
import { rescheduleSubscriptionUpdates } from './subscription-updater'

/** After login/sync: import managed subscription URL into profiles. */
export async function syncManagedFromPrivate(): Promise<PrivateSubscriptionInfo | null> {
  const mod = getPrivateModule()
  if (!mod.capabilities().supportsAuth) return null

  let info: PrivateSubscriptionInfo | null = null
  try {
    info = await mod.syncSubscription()
  } catch (e) {
    log(`subscription sync failed: ${e}`, 'warn')
    try {
      info = await mod.fetchSubscription()
    } catch (e2) {
      log(`subscription fetch failed: ${e2}`, 'warn')
      return null
    }
  }
  if (!info?.url) return info

  const subMeta: SubscriptionInfo = {
    title: info.title,
    upload: info.upload ?? 0,
    download: info.download ?? 0,
    total: info.total ?? 0,
    expire: info.expire ?? 0,
  }

  await upsertManagedProfile(info.url, info.title || 'CheezyVPN', subMeta)
  rescheduleSubscriptionUpdates()
  notifyProfilesChanged()
  return info
}
