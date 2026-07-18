/**
 * Private-module contract for CheezyVPN desktop overlay.
 * Open builds use a no-op stub; proprietary loads a real module from resources/private.
 */
export const PRIVATE_IPC = {
  capabilities: 'private:capabilities',
  accountGetSession: 'private:account:getSession',
  accountLogin: 'private:account:login',
  accountLogout: 'private:account:logout',
  subscriptionFetch: 'private:subscription:fetch',
  subscriptionUserInfo: 'private:subscription:userInfo',
  subscriptionSync: 'private:subscription:sync',
} as const

export interface PrivateAccountSession {
  email?: string
  tgId?: number
  token?: string
  emailVerified?: boolean
}

export interface PrivateSubscriptionInfo {
  url: string
  title?: string
  expire?: number
  upload?: number
  download?: number
  total?: number
}

export interface PrivateCapabilities {
  supportsAuth: boolean
  productName: string
}

export interface PrivateModule {
  capabilities(): PrivateCapabilities
  getSession(): Promise<PrivateAccountSession | null>
  login(email: string, password: string): Promise<PrivateAccountSession>
  logout(): Promise<void>
  fetchSubscription(): Promise<PrivateSubscriptionInfo | null>
  /** Refresh /me and return subscription snapshot (may update tokens). */
  syncSubscription(): Promise<PrivateSubscriptionInfo | null>
}
