import { execFile } from 'child_process'
import { promisify } from 'util'
import { createHash } from 'crypto'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { platform } from 'os'
import { HELPER_PORT, HELPER_IDENTITY } from '../shared/types'
import { coreBinaryPath, helperBinaryPath, bundledHelperDir } from './paths'
import { log } from './logger'

const execFileAsync = promisify(execFile)
const SERVICE_NAME = 'CheezyHelperService'

function helperBase(): string {
  return `http://127.0.0.1:${HELPER_PORT}`
}

/** True only if OUR helper answers (not FlClashX on a colliding port). */
export async function pingHelper(): Promise<boolean> {
  try {
    const res = await fetch(`${helperBase()}/whoami`, {
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return false
    const text = (await res.text()).trim()
    return text === HELPER_IDENTITY || text.startsWith('CheezyHelper/')
  } catch {
    return false
  }
}

/** Returns allowlist hash from helper /ping, or null if unreachable / wrong helper. */
export async function helperAllowedHash(): Promise<string | null> {
  try {
    const res = await fetch(`${helperBase()}/ping`, {
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return null
    const body = (await res.text()).trim()
    const headerOk = res.headers.get('x-cheezy-helper')?.startsWith('CheezyHelper/') === true
    const bodyOk = body.startsWith('CheezyHelper/')
    if (!headerOk && !bodyOk) return null
    const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const hash = lines[lines.length - 1]?.toLowerCase()
    if (!hash) return null
    if (hash.length === 64 || hash === 'dev-allow-any') return hash
    return null
  } catch {
    return null
  }
}

export async function syncHelperAllowlist(): Promise<boolean> {
  if (!existsSync(coreBinaryPath())) return false
  const hash = sha256File(coreBinaryPath())
  // Write beside bundled helper + beside the actual service ImagePath if different.
  const targets = new Set<string>([dirname(helperBinaryPath())])
  try {
    const serviceDir = await windowsServiceDir()
    if (serviceDir) targets.add(serviceDir)
  } catch {
    /* ignore */
  }
  for (const dir of targets) {
    try {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'allowed_core.sha256'), hash, 'utf8')
      log(`wrote allowlist → ${join(dir, 'allowed_core.sha256')}`)
    } catch (e) {
      log(`allowlist write failed (${dir}): ${e}`, 'warn')
    }
  }
  if (!(await pingHelper())) return false
  // Prefer live /allow (updates whatever directory the running process uses).
  try {
    const res = await fetch(`${helperBase()}/allow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: coreBinaryPath(), hash }),
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const text = await res.text()
      if (!text) {
        log(`helper /allow synced hash=${hash.slice(0, 12)}…`)
        return true
      }
    }
  } catch {
    // Old helper without /allow — file write above may be enough if paths match.
  }
  const now = await helperAllowedHash()
  const ok = !now || now === hash || now === 'dev-allow-any'
  if (!ok) {
    log(
      `helper allowlist still stale (want ${hash.slice(0, 12)}… have ${now?.slice(0, 12)}…). Reinstall helper.`,
      'warn',
    )
  }
  return ok
}

async function windowsServiceDir(): Promise<string | null> {
  if (platform() !== 'win32') return null
  try {
    const { stdout } = await execFileAsync('sc', ['qc', SERVICE_NAME])
    // BINARY_PATH_NAME   : "C:\...\CheezyHelperService.exe"
    const m = stdout.match(/BINARY_PATH_NAME\s*:\s*"?([^"\r\n]+)"?/i)
    if (!m?.[1]) return null
    return dirname(m[1].trim())
  } catch {
    return null
  }
}

export async function startCoreByHelper(
  arg: string,
  homeDir: string,
  safePaths?: string,
): Promise<boolean> {
  await syncHelperAllowlist()
  const tryStart = async (): Promise<{ ok: boolean; detail: string }> => {
    try {
      const res = await fetch(`${helperBase()}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: coreBinaryPath(),
          arg,
          home_dir: homeDir,
          safe_paths: safePaths || homeDir,
        }),
        signal: AbortSignal.timeout(15_000),
      })
      const text = await res.text()
      if (!res.ok || text) return { ok: false, detail: text || String(res.status) }
      return { ok: true, detail: '' }
    } catch (e) {
      return { ok: false, detail: String(e) }
    }
  }

  let result = await tryStart()
  if (!result.ok && /SHA256|hash/i.test(result.detail) && platform() === 'win32') {
    log('helper hash mismatch — reinstalling service with fresh allowlist', 'warn')
    await installWindowsHelper()
    await syncHelperAllowlist()
    result = await tryStart()
  }
  if (!result.ok) {
    log(`helper start failed: ${result.detail}`, 'warn')
    return false
  }
  return true
}

export async function stopCoreByHelper(): Promise<void> {
  try {
    await fetch(`${helperBase()}/stop`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    /* ignore */
  }
}

export async function replaceCoreViaHelper(
  pending: string,
  target: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${helperBase()}/replace_core`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pending, target }),
      signal: AbortSignal.timeout(30_000),
    })
    const text = await res.text()
    return res.ok && !text
  } catch (e) {
    log(`replace_core failed: ${e}`, 'warn')
    return false
  }
}

export function sha256File(path: string): string {
  const hash = createHash('sha256')
  hash.update(readFileSync(path))
  return hash.digest('hex')
}

export async function queryWindowsService(): Promise<'none' | 'presence' | 'running'> {
  if (platform() !== 'win32') return 'none'
  try {
    const { stdout } = await execFileAsync('sc', ['query', SERVICE_NAME])
    if (stdout.includes('RUNNING') && (await pingHelper())) return 'running'
    return 'presence'
  } catch {
    return 'none'
  }
}

/** Try start existing service without UAC. */
export async function tryStartExistingService(): Promise<boolean> {
  if (platform() !== 'win32') return pingHelper()
  const status = await queryWindowsService()
  if (status === 'running') return true
  if (status === 'none') return false
  try {
    await execFileAsync('sc', ['start', SERVICE_NAME])
    await new Promise((r) => setTimeout(r, 500))
    return (await queryWindowsService()) === 'running'
  } catch {
    return false
  }
}

/**
 * Install / repair helper with UAC.
 * Always stop+delete+create so a zombie service (bound to a dead port / old binary) is replaced.
 */
export async function installWindowsHelper(): Promise<boolean> {
  if (platform() !== 'win32') return false
  const helper = helperBinaryPath()
  if (!existsSync(helper)) {
    log(`helper binary missing at ${helper}`, 'error')
    return false
  }
  mkdirSync(bundledHelperDir(), { recursive: true })
  if (existsSync(coreBinaryPath())) {
    const hash = sha256File(coreBinaryPath())
    writeFileSync(join(dirname(helper), 'allowed_core.sha256'), hash, 'utf8')
    log(`pre-install allowlist ${hash.slice(0, 12)}…`)
  }

  // stop/delete may fail if absent — ignore via `&` chain
  const command = [
    'sc',
    'stop',
    SERVICE_NAME,
    '&',
    'sc',
    'delete',
    SERVICE_NAME,
    '&',
    'sc',
    'create',
    SERVICE_NAME,
    `binPath= "${helper}"`,
    'start= auto',
    '&&',
    'sc',
    'start',
    SERVICE_NAME,
  ].join(' ')

  const ps = `Start-Process -FilePath cmd.exe -ArgumentList '/c ${command.replace(/'/g, "''")}' -Verb RunAs -Wait`
  log(`installing helper service (port ${HELPER_PORT})…`)
  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-Command', ps], {
      windowsHide: true,
    })
    // Wait for listener
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 400))
      if (await pingHelper()) {
        log('helper service reachable')
        return true
      }
    }
    log(
      `helper service installed but not reachable on 127.0.0.1:${HELPER_PORT} — is another app blocking?`,
      'error',
    )
    return false
  } catch (e) {
    log(`install helper UAC failed: ${e}`, 'error')
    return false
  }
}

export async function ensureHelper(): Promise<boolean> {
  if (await pingHelper()) {
    await syncHelperAllowlist()
    return true
  }
  if (await tryStartExistingService()) {
    await syncHelperAllowlist()
    return true
  }
  if (platform() === 'win32') {
    const ok = await installWindowsHelper()
    if (ok) await syncHelperAllowlist()
    return ok
  }
  return false
}
