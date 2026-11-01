// Real routes/DNS/service changes. Refuse to run outside disposable GitHub CI.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') {
  throw new Error('Run only on a disposable GitHub-hosted macOS runner')
}
const desktop = fileURLToPath(new URL('..', import.meta.url))
const appIndex = process.argv.indexOf('--app')
const resources = appIndex < 0 ? join(desktop, 'resources') : join(realpathSync(process.argv[appIndex + 1]), 'Contents/Resources')
const helper = join(resources, 'helper/cheezy-helper')
const core = join(resources, 'core/mihomo')
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const parent = join(homedir(), 'Library/Application Support', `CheezyClash-CITest-${randomBytes(8).toString('hex')}`)
mkdirSync(join(parent, 'cheezy/home'), { recursive: true })
const root = realpathSync(join(parent, 'cheezy'))
const uid = String(process.getuid())
const id = createHash('sha256').update(root).digest('hex').slice(0, 16)
const socketPath = `/var/run/cheezy-tun-${uid}.${id}.sock`
const label = `com.cheezy.tun.${uid}.${id}`
const systemDir = `/Library/PrivilegedHelperTools/com.cheezy.tun/${uid}.${id}`
const secret = randomBytes(24).toString('hex')
const run = (file, args) => execFileSync(file, args, { encoding: 'utf8', timeout: 45000 })
const sudo = args => run('/usr/bin/sudo', ['-n', ...args])
const pause = () => new Promise(resolve => setTimeout(resolve, 250))
const api = (path, body) => new Promise((resolve, reject) => {
  const req = request({ socketPath, path, method: path === '/ping' ? 'GET' : 'POST', timeout: 15000,
    headers: { 'Content-Type': 'application/json' } }, res => {
    let value = ''; res.on('data', chunk => { value += chunk }); res.on('error', reject)
    res.on('end', () => res.statusCode === 200 ? resolve(value) : reject(new Error(value)))
  })
  req.on('timeout', () => req.destroy(new Error('helper timeout'))); req.on('error', reject)
  req.end(body && JSON.stringify(body))
})
const info = async () => JSON.parse(await api('/ping'))
async function until(check) {
  for (let i = 0; i < 80; i++) { try { if (await check()) return } catch {} await pause() }
  throw new Error('macOS smoke timed out')
}
async function controller() {
  const response = await fetch('http://127.0.0.1:19090/configs', { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(1500) })
  if (!response.ok) throw new Error('controller unavailable')
  return response.json()
}
const route = () => run('/sbin/route', ['-n', 'get', '1.1.1.1']).match(/interface:\s*(\S+)/)?.[1]
const baselineInterface = route()
let heartbeat
try {
  writeFileSync(join(root, 'home/running-config.yaml'), `
mixed-port: 17890
external-controller: 127.0.0.1:19090
secret: ${secret}
mode: direct
log-level: info
dns:
  enable: true
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  nameserver: [https://1.1.1.1/dns-query]
tun:
  enable: true
  stack: gvisor
  mtu: 1500
  auto-route: true
  auto-detect-interface: true
  strict-route: true
  dns-mode: native
  dns-hijack: [any:53, tcp://any:53]
rules: ['MATCH,DIRECT']
`)
  const install = () => sudo([helper, '--install', uid, id, root, core, hash(core), hash(helper)])
  install()
  await until(async () => (await info()).core_hash === hash(core))
  assert.equal((await info()).running, false, 'Installing service must not start a VPN')
  heartbeat = setInterval(() => { void api('/heartbeat').catch(() => {}) }, 10000)
  const start = async () => {
    await api('/start', { core_hash: hash(core) })
    await until(async () => (await controller()).tun?.enable === true)
    assert.match(route() ?? '', /^utun/)
    const dns = run('/usr/sbin/scutil', ['--dns'])
    assert.match(dns, /198\.18\./, 'Native DNS registration missing')
    const answer = run('/usr/bin/dig', ['@8.8.8.8', 'example.com', 'A', '+short', '+time=5', '+tries=1'])
    assert.match(answer, /198\.18\./, 'DNS request did not reach the TUN resolver')
    run('/usr/bin/curl', ['--noproxy', '*', '--fail', '--silent', '--show-error', '--max-time', '20', 'https://example.com/'])
  }
  await start()
  await api('/stop')
  await until(() => route() === baselineInterface)
  assert.equal((await info()).running, false)
  assert.ok(!run('/usr/sbin/scutil', ['--dns']).includes('198.18.'), 'DNS registration must be removed')
  // Reinstall while running exercises launchd shutdown, protected file replacement
  // and reuse after an application/core update, with real administrator privileges.
  await start()
  install()
  await until(async () => !(await info()).running)
  await start()
  console.log('Native macOS TUN: install, real interface, route, DNS, HTTPS, stop and reinstall passed')
} catch (error) {
  try { console.error((await info()).log_tail) } catch {}
  try { console.error(run('/bin/launchctl', ['print', `system/${label}`])) } catch {}
  throw error
} finally {
  clearInterval(heartbeat)
  try { await api('/stop') } catch {}
  sudo([helper, '--uninstall', uid, id])
  assert.equal(existsSync(systemDir), false)
  assert.equal(existsSync(`/Library/LaunchDaemons/${label}.plist`), false)
  await until(() => route() === baselineInterface)
  assert.ok(!run('/usr/sbin/scutil', ['--dns']).includes('198.18.'))
  assert.equal(dirname(root), realpathSync(parent))
  rmSync(parent, { recursive: true, force: true })
  console.log('Native macOS TUN: uninstall and network restoration passed')
}
