import { platform } from 'os'
import { existsSync, statSync } from 'fs'
import { coreBinaryPath } from './paths'
import { pingHelper, ensureHelper, queryWindowsService } from './helper'
import { log } from './logger'

/**
 * B1 — privilege checks for TUN on Unix; Windows uses helper service.
 */
export async function privilegesOk(forTun: boolean): Promise<boolean> {
  if (!forTun) return true
  const p = platform()
  if (p === 'linux') return pingHelper()
  if (p !== 'win32' && process.getuid?.() === 0) return true
  if (p === 'win32') {
    return (await queryWindowsService()) === 'running' || (await pingHelper())
  }
  // macOS: allow TUN attempt; user may grant via helper or run elevated once.
  // Documented model: prefer helper when available, else warn in UI.
  return (await pingHelper()) || isSetuidRoot(coreBinaryPath())
}

function isSetuidRoot(path: string): boolean {
  if (!existsSync(path)) return false
  try {
    const st = statSync(path)
    // mode & 0o4000 = setuid
    return st.uid === 0 && (st.mode & 0o4000) !== 0
  } catch {
    return false
  }
}

export async function authorizeForTun(): Promise<boolean> {
  if (platform() === 'win32') return ensureHelper()
  if (platform() === 'linux') {
    return ensureHelper()
  }
  if (await privilegesOk(true)) return true
  // macOS has no helper installation flow yet; only an existing helper can work.
  if (await ensureHelper()) return true
  log(
    'macOS TUN: privileged helper unavailable; automatic setup is not implemented',
    'warn',
  )
  return false
}
