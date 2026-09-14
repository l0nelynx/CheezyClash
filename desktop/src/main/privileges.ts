import { execFile } from 'child_process'
import { promisify } from 'util'
import { platform } from 'os'
import { existsSync, statSync } from 'fs'
import { coreBinaryPath } from './paths'
import { pingHelper, ensureHelper, queryWindowsService } from './helper'
import { log } from './logger'

const execFileAsync = promisify(execFile)

/**
 * B1 — privilege checks for TUN on Unix; Windows uses helper service.
 */
export async function privilegesOk(forTun: boolean): Promise<boolean> {
  if (!forTun) return true
  const p = platform()
  if (p !== 'win32' && process.getuid?.() === 0) return true
  if (p === 'win32') {
    return (await queryWindowsService()) === 'running' || (await pingHelper())
  }
  if (p === 'linux') {
    return isSetuidRoot(coreBinaryPath()) || (await pingHelper())
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

/** One-shot: prompt via pkexec/sudo to setuid the core binary (Linux). */
export async function authorizeCoreLinux(): Promise<boolean> {
  if (platform() !== 'linux') return false
  const core = coreBinaryPath()
  if (!existsSync(core)) return false
  if (isSetuidRoot(core)) return true
  try {
    await execFileAsync('pkexec', [
      'bash',
      '-c',
      `chown root:root "${core}" && chmod u+s "${core}"`,
    ])
    return isSetuidRoot(core)
  } catch (e) {
    log(`authorizeCoreLinux failed: ${e}`, 'warn')
    return false
  }
}

export async function authorizeForTun(): Promise<boolean> {
  if (platform() === 'win32') return ensureHelper()
  if (platform() === 'linux') {
    if (await privilegesOk(true)) return true
    return authorizeCoreLinux()
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
