import { app } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { createHash } from 'crypto'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { platform } from 'os'
import { HELPER_PORT, HELPER_IDENTITY } from '../shared/types'
import { coreBinaryPath, helperBinaryPath } from './paths'
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

/** Shared, path-scoped service operations. Packaged outside ASAR for PowerShell. */
async function controlWindowsHelper(action: 'StartHelper' | 'StopHelper' | 'RepairHelper', elevated = false): Promise<void> {
  const script = app.isPackaged
    ? join(process.resourcesPath, 'helper-control.ps1')
    : join(dirname(dirname(helperBinaryPath())), '..', 'build', 'installer-processes.ps1')
  const installDir = dirname(dirname(dirname(helperBinaryPath())))
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-InstallDir', installDir, '-AppExecutable', 'CheezyClash.exe', '-Action', action]
  if (elevated) {
    // Encode the wrapper, keeping paths literal (including apostrophes and $).
    const literals = args.map(value => "'" + ('"' + value + '"').replace(/'/g, "''") + "'").join(',')
    const command = `$ErrorActionPreference = 'Stop'; $p = Start-Process -FilePath powershell.exe -ArgumentList @(${literals}) -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode`
    await execFileAsync('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { windowsHide: true })
  } else {
    await execFileAsync('powershell.exe', args, { windowsHide: true, timeout: 20_000 })
  }
}

/** Stop only this installation's registered service, never another portable copy. */
export async function stopHelperOnExit(): Promise<void> {
  if (platform() !== 'win32') return
  try { await controlWindowsHelper('StopHelper') }
  catch (error) { log(`helper exit cleanup failed; repair helper permissions: ${error}`, 'warn') }
}

export async function tryStartExistingService(): Promise<boolean> {
  if (platform() !== 'win32') return pingHelper()
  try {
    await controlWindowsHelper('StartHelper')
    for (let i = 0; i < 20; i++) {
      if (await pingHelper()) return true
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  } catch (error) { log(`helper start requires setup: ${error}`, 'warn') }
  return false
}

/** One-time registration/permissions migration. Never delete or hijack a service. */
export async function installWindowsHelper(): Promise<boolean> {
  if (platform() !== 'win32' || !existsSync(helperBinaryPath())) return false
  try {
    await controlWindowsHelper('RepairHelper', true)
    return await tryStartExistingService()
  } catch (error) {
    log(`helper setup failed or cancelled: ${error}`, 'error')
    return false
  }
}

export async function ensureHelper(): Promise<boolean> {
  if (platform() !== 'win32' && await pingHelper()) {
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
