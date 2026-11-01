import { platform } from 'os'
import { pingHelper, ensureHelper, queryWindowsService } from './helper'

/**
 * B1 — privilege checks for TUN on Unix; Windows uses helper service.
 */
export async function privilegesOk(forTun: boolean): Promise<boolean> {
  if (!forTun) return true
  const p = platform()
  if (p === 'linux' || p === 'darwin') return pingHelper()
  if (p === 'win32') {
    return (await queryWindowsService()) === 'running' || (await pingHelper())
  }
  return false
}

export async function authorizeForTun(): Promise<boolean> {
  if (platform() === 'win32') return ensureHelper()
  if (platform() === 'linux' || platform() === 'darwin') {
    return ensureHelper()
  }
  return false
}
