import { listProfiles, refreshProfile } from './profiles'
import { log } from './logger'
import { notifyProfilesChanged } from './profile-events'

const MIN_TICK_MS = 15 * 60 * 1000
const HOUR_MS = 3600_000

let timer: ReturnType<typeof setInterval> | null = null
let running = false

function dueProfiles(): { id: string; name: string }[] {
  const now = Date.now()
  return listProfiles().filter((p) => {
    const hours = p.updateIntervalHours ?? 0
    if (!p.url || hours <= 0) return false
    return now - p.updatedAt >= hours * HOUR_MS
  })
}

function nextTickMs(): number {
  const hours = listProfiles()
    .map((p) => p.updateIntervalHours ?? 0)
    .filter((h) => h > 0)
  if (hours.length === 0) return MIN_TICK_MS
  const minHours = Math.min(...hours)
  return Math.max(MIN_TICK_MS, Math.min(minHours * HOUR_MS, 60 * 60 * 1000))
}

async function tick(): Promise<void> {
  if (running) return
  running = true
  let any = false
  try {
    const due = dueProfiles()
    for (const p of due) {
      try {
        log(`subscription auto-update: ${p.name} (${p.id})`)
        await refreshProfile(p.id, { reloadCore: false })
        any = true
      } catch (e) {
        log(`subscription auto-update failed for ${p.id}: ${e}`, 'warn')
      }
    }
  } finally {
    running = false
  }
  if (any) notifyProfilesChanged()
}

/** Start or refresh the background subscription update timer. */
export function rescheduleSubscriptionUpdates(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  const ms = nextTickMs()
  timer = setInterval(() => {
    void tick()
  }, ms)
  // Unref so the timer does not keep the process alive on quit in edge cases.
  if (typeof timer === 'object' && timer && 'unref' in timer) {
    ;(timer as NodeJS.Timeout).unref()
  }
  log(`subscription updater tick every ${Math.round(ms / 60000)} min`)
}

export function startSubscriptionUpdater(): void {
  rescheduleSubscriptionUpdates()
  // Opportunistic check shortly after launch (don't block ready).
  setTimeout(() => {
    void tick()
  }, 30_000).unref?.()
}

export function stopSubscriptionUpdater(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
