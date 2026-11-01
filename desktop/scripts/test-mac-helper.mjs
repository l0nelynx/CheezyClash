import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { posix } from 'node:path'
import ts from 'typescript'

const file = new URL('../src/main/mac-helper.ts', import.meta.url)
const nativeRequire = createRequire(file)
const js = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const hash = createHash('sha256').update('binary').digest('hex')
const root = '/Users/test/Library/Application Support/CheezyClash/cheezy'

function fixture({ installed = true, mismatch = false, cancel = false, authCancel = false, startFail = false, executable = '/Applications/CheezyClash.app/Contents/MacOS/CheezyClash', uid = 501 } = {}) {
  const calls = [], requests = [], dialogs = [], logs = []
  const mocks = {
    electron: { app: { isPackaged: true, getPath: () => executable, getLocale: () => 'ru' }, dialog: { showMessageBox: async options => {
      dialogs.push(options); return { response: cancel ? 1 : 0 }
    } } },
    util: { promisify: () => async (file, args) => {
      calls.push({ file, args })
      if (authCancel) throw new Error('User canceled. (-128)')
      installed = !args[1].includes('--uninstall'); mismatch = false
      return { stdout: '', stderr: '' }
    } },
    fs: { readFileSync: () => Buffer.from('binary'), mkdirSync() {}, realpathSync: value => value,
      existsSync: value => value.endsWith('manifest.json') ? installed : true },
    path: posix,
    './paths': { coreBinaryPath: () => '/Applications/It\'s $safe `app`.app/core/mihomo',
      helperBinaryPath: () => '/Applications/It\'s $safe `app`.app/helper/cheezy-helper', userDataRoot: () => root },
    './logger': { log: (...args) => logs.push(args) },
    http: { request: (options, callback) => {
      const req = new EventEmitter()
      req.destroy = error => { req.emit('error', error); req.emit('close') }
      req.end = payload => {
        requests.push({ ...options, body: payload && JSON.parse(payload) })
        process.nextTick(() => {
          if (!installed) { req.destroy(Object.assign(new Error('missing'), { code: 'ENOENT' })); return }
          const res = new EventEmitter()
          res.statusCode = startFail && options.path === '/start' ? 500 : 200
          res.setEncoding = () => {}; callback(res)
          res.emit('data', options.path === '/ping' ? JSON.stringify({ identity: 'CheezyHelper/macOS/1', core_hash: mismatch ? 'a'.repeat(64) : hash,
            helper_hash: hash, data_root: root, running: true, last_error: '', log_tail: '' }) : res.statusCode === 500 ? 'sandbox failed' : '')
          res.emit('end'); req.emit('close')
        })
      }
      return req
    } },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'process', js)(name => mocks[name] ?? nativeRequire(name), module, module.exports, { getuid: () => uid })
  return { api: module.exports, calls, requests, dialogs, logs }
}

let f = fixture()
assert.equal(await f.api.ensureMacHelper(), true)
assert.equal(f.calls.length, 0)
assert.equal(f.dialogs.length, 0, 'Matching service must not prompt again')
assert.equal(await f.api.startMacCore(), true)
assert.deepEqual(f.requests.find(r => r.path === '/start').body, { core_hash: hash }, 'No executable, arguments or filesystem paths over IPC')
assert.match(f.requests[0].socketPath, /^\/var\/run\/cheezy-tun-501\.[a-f0-9]{16}\.sock$/)
await f.api.stopMacCore()
assert.ok(f.requests.some(r => r.path === '/stop'))
for (const opts of [{ installed: false }, { mismatch: true }]) {
  f = fixture(opts)
  assert.deepEqual(await Promise.all([f.api.ensureMacHelper(), f.api.ensureMacHelper()]), [true, true])
  assert.equal(f.calls.length, 1, 'One setup / administrator prompt for concurrent callers')
  assert.equal(f.dialogs.length, 1)
  assert.equal(f.calls[0].file, '/usr/bin/osascript')
  assert.match(f.calls[0].args[1], /with administrator privileges$/)
  assert.ok(f.calls[0].args[1].includes('--install'))
  assert.ok(!f.calls[0].args[1].includes('chmod 4755'))
  assert.equal(f.api.macHelperSetupState(), 'ready')
}
assert.equal(f.api.shellQuote("a'b $()`"), "'a'\\''b $()`'")
assert.equal(JSON.parse(f.api.appleString('path "quotes" \\ line\n')), 'path "quotes" \\ line\n')
for (const opts of [{ cancel: true }, { authCancel: true }]) {
  f = fixture({ installed: false, ...opts })
  assert.equal(await f.api.ensureMacHelper(), false)
  assert.equal(f.api.macHelperSetupState(), 'cancelled')
  assert.match(f.api.macHelperError(), /cancelled/)
  assert.equal(f.calls.length, opts.cancel ? 0 : 1, 'Never retry a cancelled authorization automatically')
}
f = fixture({ installed: false, executable: '/Volumes/CheezyClash/CheezyClash.app/Contents/MacOS/CheezyClash' })
assert.equal(await f.api.ensureMacHelper(), false)
assert.match(f.api.macHelperError(), /Move the app to Applications/)
assert.equal(f.dialogs.length, 0)
f = fixture({ uid: 0 })
assert.equal(await f.api.ensureMacHelper(), false)
assert.equal(f.calls.length, 0)
f = fixture({ startFail: true })
assert.equal(await f.api.startMacCore(), false)
assert.match(f.api.macHelperError(), /could not start/)
f = fixture()
assert.equal(await f.api.ensureMacHelper(true), true)
assert.equal(f.calls.length, 1, 'Repair must reinstall even when hashes match')
assert.equal(await f.api.removeMacHelper(), true)
assert.ok(f.calls.at(-1).args[1].includes('--uninstall'))
assert.equal(f.api.macHelperSetupState(), 'needed')
console.log('macOS helper: first install, reuse, update, repair, removal, cancellation, quoting and IPC scope passed (mock OS)')
