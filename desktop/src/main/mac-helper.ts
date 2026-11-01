import { app, dialog } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { request } from 'http'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'fs'
import { join } from 'path'
import { coreBinaryPath, helperBinaryPath, userDataRoot } from './paths'
import { log } from './logger'
import type { MacTunSetup } from '../shared/types'

const execFileAsync = promisify(execFile)
const IDENTITY = 'CheezyHelper/macOS/1'
let operation: Promise<boolean> | undefined
let setupState: MacTunSetup = 'needed'
let lastError = ''
let leaseTimer: ReturnType<typeof setInterval> | undefined
let lastTail = ''

export function macHelperError(): string { return lastError }
export function macHelperSetupState(): MacTunSetup { return setupState }

function location(): { uid: number; instance: string; root: string; socket: string; dir: string } {
  const uid = process.getuid?.()
  if (!uid) throw new Error('Open the app as your normal macOS user.')
  mkdirSync(userDataRoot(), { recursive: true })
  const root = realpathSync(userDataRoot())
  const instance = createHash('sha256').update(root).digest('hex').slice(0, 16)
  const dir = `/Library/PrivilegedHelperTools/com.cheezy.tun/${uid}.${instance}`
  return { uid, instance, root, socket: `${dir}/control.sock`, dir }
}

function hash(file: string): string { return createHash('sha256').update(readFileSync(file)).digest('hex') }

export function macHelperRequest(path: '/ping' | '/start' | '/stop' | '/heartbeat', body?: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const req = request({ socketPath: location().socket, path, method: path === '/ping' ? 'GET' : 'POST',
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
    }, res => {
      let result = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => {
        result += chunk
        if (result.length > 65536) req.destroy(new Error('TUN service response too large'))
      })
      res.on('error', reject)
      res.on('end', () => res.statusCode === 200 ? resolve(result) : reject(new Error(result.trim() || `TUN service HTTP ${res.statusCode}`)))
    })
    const timeout = setTimeout(() => req.destroy(new Error('TUN service did not respond. Try Repair service.')), path === '/ping' ? 2000 : 15000)
    req.on('close', () => clearTimeout(timeout))
    req.on('error', reject)
    req.end(payload)
  })
}

interface MacHelperInfo {
  identity: string
  core_hash: string
  helper_hash: string
  data_root: string
  running: boolean
  last_error: string
  log_tail: string
}

export async function macHelperInfo(): Promise<MacHelperInfo | null> {
  try {
    const info = JSON.parse(await macHelperRequest('/ping')) as MacHelperInfo
    if (info.identity !== IDENTITY || info.data_root !== location().root ||
      !/^[a-f0-9]{64}$/.test(info.core_hash) || !/^[a-f0-9]{64}$/.test(info.helper_hash) || typeof info.running !== 'boolean') return null
    return info
  } catch { return null }
}

export function macHelperInstalled(): boolean {
  try { return existsSync(join(location().dir, 'manifest.json')) } catch { return false }
}

// Two independent languages: quote shell arguments first, then the AppleScript
// string literal. No path is interpolated as shell or AppleScript source.
export function shellQuote(value: string): string { return "'" + value.replace(/'/g, "'\\''") + "'" }
export function appleString(value: string): string {
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"'
}

async function authorize(args: string[]): Promise<void> {
  const command = [helperBinaryPath(), ...args].map(shellQuote).join(' ')
  await execFileAsync('/usr/bin/osascript', ['-e', `do shell script ${appleString(command)} with administrator privileges`], { timeout: 180000 })
}

function message(en: string, ru: string): string { return app.getLocale().startsWith('ru') ? ru : en }

async function setup(force: boolean, remove = false): Promise<boolean> {
  lastError = ''
  try {
    const loc = location()
    if (!remove && !force) {
      const info = await macHelperInfo()
      if (info?.core_hash === hash(coreBinaryPath()) && info.helper_hash === hash(helperBinaryPath())) {
        setupState = 'ready'; return true
      }
    }
    if (app.isPackaged && !app.getPath('exe').startsWith('/Applications/')) {
      throw new Error('Move the app to Applications, reopen it, then connect again.')
    }
    if (!existsSync(helperBinaryPath())) throw new Error('The TUN service is missing from this build. Reinstall the app.')
    setupState = 'approval'
    const result = await dialog.showMessageBox({
      type: 'info',
      title: remove ? message('Remove TUN service', 'Удалить службу TUN') : message('Set up TUN', 'Настройка TUN'),
      message: remove
        ? message('Remove the system service? Your profiles will be kept.', 'Удалить системную службу? Ваши профили сохранятся.')
        : message('TUN needs a system service. macOS will ask for an administrator password.', 'Для TUN нужна системная служба. macOS запросит пароль администратора.'),
      detail: remove
        ? message('TUN will disconnect. You can install the service again the next time you connect.', 'TUN будет отключён. Службу можно установить заново при следующем подключении.')
        : message('The service is installed once. An update to the service or VPN core may require approval again. After setup, this connection continues automatically.', 'Служба устанавливается один раз. Обновление службы или VPN-ядра может потребовать повторного разрешения. После настройки подключение продолжится автоматически.'),
      buttons: [message('Continue', 'Продолжить'), message('Cancel', 'Отмена')], defaultId: 0, cancelId: 1,
    })
    if (result.response !== 0) {
      setupState = 'cancelled'; lastError = 'TUN setup was cancelled. Try again or connect through Proxy.'; return false
    }
    setupState = remove ? 'removing' : 'installing'
    if (remove) {
      await authorize(['--uninstall', String(loc.uid), loc.instance])
      stopLease(); setupState = 'needed'; return true
    }
    const coreHash = hash(coreBinaryPath()), helperHash = hash(helperBinaryPath())
    setupState = 'approval'
    await authorize(['--install', String(loc.uid), loc.instance, loc.root, coreBinaryPath(), coreHash, helperHash])
    setupState = 'installing'
    for (let i = 0; i < 30; i++) {
      const info = await macHelperInfo()
      if (info?.core_hash === coreHash && info.helper_hash === helperHash) { setupState = 'ready'; return true }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    try { log(`macOS TUN service: ${readFileSync(join(loc.dir, 'helper.log'), 'utf8').slice(-16384)}`, 'error') } catch { /* service may not have launched */ }
    throw new Error('The TUN service did not start. Check macOS background permissions, then try Repair service.')
  } catch (error) {
    const detail = String(error)
    const cancelled = /(-128|user cancel|cancelled)/i.test(detail)
    setupState = cancelled ? 'cancelled' : 'error'
    lastError = cancelled ? 'TUN setup was cancelled. Try again or connect through Proxy.' : 'Could not set up the TUN service. Open Logs for details or try Repair service.'
    // Known actionable preflight messages are safe and useful in the UI.
    if (error instanceof Error && /^(Move the app|The TUN service is missing|The TUN service did not start|Open the app)/.test(error.message)) lastError = error.message
    log(`macOS TUN setup: ${detail}`, 'error')
    return false
  }
}

export function ensureMacHelper(force = false): Promise<boolean> {
  operation ??= setup(force).finally(() => { operation = undefined })
  return operation
}

export function removeMacHelper(): Promise<boolean> {
  if (operation) return Promise.reject(new Error('TUN service setup is already in progress.'))
  operation = setup(false, true).finally(() => { operation = undefined })
  return operation
}

function stopLease(): void { if (leaseTimer) clearInterval(leaseTimer); leaseTimer = undefined }

async function collectLogs(): Promise<void> {
  const info = await macHelperInfo()
  if (leaseTimer && info && !info.running) {
    stopLease()
    lastError = 'TUN stopped unexpectedly. Reconnect or open Logs for details.'
    log(info.last_error || lastError, 'error')
  }
  const tail = info?.log_tail ?? ''
  if (tail && tail !== lastTail) {
    const extra = tail.startsWith(lastTail) ? tail.slice(lastTail.length) : tail
    for (const line of extra.trim().split('\n')) if (line) log(`[macOS core] ${line}`)
    lastTail = tail
  }
}

export function maintainMacCoreLease(): void {
  if (leaseTimer) return
  let pending = false
  leaseTimer = setInterval(() => {
    if (pending) return
    pending = true
    void macHelperRequest('/heartbeat').then(collectLogs).catch(() => undefined).finally(() => { pending = false })
  }, 10000)
  leaseTimer.unref()
}

export async function startMacCore(): Promise<boolean> {
  try {
    lastTail = ''
    await macHelperRequest('/start', { core_hash: hash(coreBinaryPath()) })
    maintainMacCoreLease(); await collectLogs(); return true
  } catch (error) {
    await collectLogs()
    lastError = 'The TUN core could not start. Open Logs for details.'
    log(`macOS TUN start: ${String(error)}`, 'error'); return false
  }
}

export async function stopMacCore(): Promise<void> {
  stopLease()
  try { await macHelperRequest('/stop'); await collectLogs() }
  catch (error) {
    if (!['ENOENT', 'ECONNREFUSED'].includes((error as NodeJS.ErrnoException).code ?? '')) log(`macOS TUN stop: ${String(error)}`, 'warn')
  }
}
