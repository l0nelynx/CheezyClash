interface AuthGateState {
  supportsAuth: boolean
  hasSession: boolean
  hasProfiles: boolean
  loginRequested: boolean
}

/** Decide whether the proprietary login screen should replace the app shell. */
export function shouldShowLogin({
  supportsAuth,
  hasSession,
  hasProfiles,
  loginRequested,
}: AuthGateState): boolean {
  return supportsAuth && !hasSession && (!hasProfiles || loginRequested)
}
