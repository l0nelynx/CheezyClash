import { execFile } from 'child_process'
import { promisify } from 'util'
import { request } from 'http'
import { createHash } from 'crypto'
import { copyFileSync, chmodSync, existsSync, mkdtempSync, readFileSync, readlinkSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { coreBinaryPath, helperBinaryPath } from './paths'
import { log } from './logger'

const execFileAsync = promisify(execFile)
const IDENTITY = 'CheezyHelper/Linux/2'
let setupInFlight: Promise<boolean> | undefined
let lastError = ''

export function linuxHelperError(): string { return lastError }

function uid(): number {
  const value = process.getuid?.()
  if (value === undefined || value === 0) throw new Error('Run CheezyClash as your normal Linux user')
  return value
}

export function inLinuxContainer(): boolean {
  return Boolean(process.env.CONTAINER_ID || process.env.container ||
    existsSync('/run/.containerenv') || existsSync('/.dockerenv'))
}

function socketPaths(): string[] {
  const name = `cheezyclash-helper-${uid()}.sock`
  return inLinuxContainer() ? [`/run/host/run/${name}`, `/run/${name}`] : [`/run/${name}`]
}

export function linuxHelperRequest(path: '/ping' | '/start' | '/stop', body?: unknown): Promise<string> {
  return (async () => {
    let failure: unknown = new Error('Linux helper socket unavailable')
    for (const socketPath of socketPaths()) {
      try {
        return await new Promise<string>((resolve, reject) => {
          const payload = body === undefined ? undefined : JSON.stringify(body)
          const req = request({ socketPath, path, method: path === '/ping' ? 'GET' : 'POST',
            headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
          }, res => {
            let result = ''
            res.setEncoding('utf8')
            res.on('data', (chunk: string) => {
              result += chunk
              if (result.length > 65536) req.destroy(new Error('Linux helper response too large'))
            })
            res.on('error', reject)
            res.on('end', () => {
              if (res.statusCode !== 200) reject(new Error(result.trim() || `Linux helper HTTP ${res.statusCode}`))
              else resolve(result)
            })
          })
          const timeout = setTimeout(() => req.destroy(new Error('Linux helper request timed out')), path === '/ping' ? 3000 : 15000)
          req.on('close', () => clearTimeout(timeout))
          req.on('error', reject)
          req.end(payload)
        })
      } catch (error) {
        // Only try an alternate mount path when no request reached the service.
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'ENOENT' && code !== 'ECONNREFUSED') throw error
        failure = error
      }
    }
    throw failure
  })()
}

export async function linuxHelperInfo(): Promise<{ core_hash: string; helper_hash: string; network_ns: string } | null> {
  try {
    const result = JSON.parse(await linuxHelperRequest('/ping'))
    if (result.identity !== IDENTITY || !/^[a-f0-9]{64}$/.test(result.core_hash) || !/^[a-f0-9]{64}$/.test(result.helper_hash) || typeof result.network_ns !== 'string') return null
    return result
  } catch { return null }
}

function coreHash(): string { return createHash('sha256').update(readFileSync(coreBinaryPath())).digest('hex') }
function helperHash(): string { return createHash('sha256').update(readFileSync(helperBinaryPath())).digest('hex') }

async function setup(): Promise<boolean> {
  lastError = ''
  let staging: string | undefined
  try {
    const user = uid()
    const namespace = readlinkSync('/proc/self/ns/net')
    const info = await linuxHelperInfo()
    if (info && info.network_ns !== namespace) throw new Error('TUN requires the host network namespace. Run CheezyClash outside the container.')
    if (info?.core_hash === coreHash() && info.helper_hash === helperHash()) return true
    if (inLinuxContainer()) {
      throw new Error('Install or update the Linux TUN helper on the host: open this version of CheezyClash outside Distrobox and enable TUN once. The container must share the host network and profile paths.')
    }
    if (!existsSync('/run/systemd/system')) throw new Error('Linux TUN helper requires a systemd host. Use Proxy mode on this system.')
    if (!existsSync(helperBinaryPath())) throw new Error('Linux helper is missing from this build. Reinstall CheezyClash.')
    // Root may not be able to traverse the user's FUSE AppImage mount.
    staging = mkdtempSync(join(tmpdir(), 'cheezy-helper-'))
    chmodSync(staging, 0o700)
    const helper = join(staging, 'cheezy-helper')
    const core = join(staging, 'mihomo')
    copyFileSync(helperBinaryPath(), helper)
    copyFileSync(coreBinaryPath(), core)
    chmodSync(helper, 0o700)
    await execFileAsync('/usr/bin/pkexec', [helper, '--install', String(user), core], { timeout: 120000 })
    for (let attempt = 0; attempt < 20; attempt++) {
      const ready = await linuxHelperInfo()
      if (ready?.core_hash === coreHash() && ready.helper_hash === helperHash() && ready.network_ns === namespace) return true
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    throw new Error(`Linux helper did not become ready. Check journalctl -u cheezyclash-helper-${user}.service on the host.`)
  } catch (error) {
    lastError = `Linux TUN helper: ${String(error)}`
    log(lastError, 'error')
    return false
  } finally {
    if (staging) rmSync(staging, { recursive: true, force: true })
  }
}

export function ensureLinuxHelper(): Promise<boolean> {
  setupInFlight ??= setup().finally(() => { setupInFlight = undefined })
  return setupInFlight
}

export async function startLinuxCore(config: string, home: string, safePaths: string): Promise<boolean> {
  try {
    await linuxHelperRequest('/start', { config, home, safe_paths: safePaths,
      core_hash: coreHash(), network_ns: readlinkSync('/proc/self/ns/net') })
    return true
  } catch (error) {
    lastError = `Linux TUN helper: ${String(error)}`
    log(lastError, 'error')
    return false
  }
}

export async function stopLinuxCore(): Promise<void> {
  try { await linuxHelperRequest('/stop') }
  catch (error) {
    if (!['ENOENT', 'ECONNREFUSED'].includes((error as NodeJS.ErrnoException).code || '')) {
      log(`Linux helper stop failed: ${String(error)}`, 'warn')
    }
  }
}
