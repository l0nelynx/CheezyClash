interface StartupTasks {
  supportsAuth: boolean
  autoConnectEnabled: () => boolean
  activeProfile: () => string | null
  /** False after any manual lifecycle request or shutdown. */
  canAutoConnect: () => boolean
  connect: () => Promise<{ running: boolean }>
  syncSubscriptions: () => Promise<unknown>
  mark: (phase: string) => void
  warn: (message: string) => void
}

/** Use the saved profile before any network-dependent subscription work. */
export async function runStartupTasks(tasks: StartupTasks): Promise<void> {
  const connectSaved = async (): Promise<void> => {
    tasks.mark('auto-connect started')
    try {
      const status = await tasks.connect()
      tasks.mark(status.running ? 'auto-connect ready' : 'auto-connect cancelled')
    } catch (error) {
      tasks.warn(`auto-connect failed: ${error}`)
    }
  }

  const hadProfile = !!tasks.activeProfile()
  if (hadProfile && tasks.autoConnectEnabled() && tasks.canAutoConnect()) {
    await connectSaved()
  }

  // This can download/refresh profiles, so run it after the saved config has
  // finished starting. Refreshed credentials apply on the next explicit reload.
  if (tasks.supportsAuth) {
    try {
      await tasks.syncSubscriptions()
      tasks.mark('subscriptions synced')
    } catch (error) {
      tasks.warn(`subscription sync failed: ${error}`)
    }
  }

  // A first run may have no local profile. Only that case needs sync first.
  // A user action during sync must not be overwritten by a late auto-connect.
  if (!hadProfile && tasks.autoConnectEnabled() && tasks.canAutoConnect()) {
    if (tasks.activeProfile()) await connectSaved()
    else tasks.warn('auto-connect skipped: no active profile')
  }
}
