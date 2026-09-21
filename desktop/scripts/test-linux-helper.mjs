import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

const filename = new URL('../src/main/linux-helper.ts', import.meta.url)
const nativeRequire = createRequire(filename)
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const hash = createHash('sha256').update('core').digest('hex')

function fixture({ installed = true, container = false, namespace = 'net:[1]', currentHash = hash, failInstall = false, systemd = true } = {}) {
  const calls = [], requests = [], cleanup = []
  const mocks = {
    util: { promisify: () => async (file, args) => {
      calls.push({ file, args })
      if (failInstall) throw new Error('authorization cancelled')
      installed = true; currentHash = hash
    } },
    fs: {
      readFileSync: () => Buffer.from('core'), readlinkSync: () => 'net:[1]',
      existsSync: path => path === '/run/.containerenv' ? container : path === '/.dockerenv' ? false : path === '/run/systemd/system' ? systemd : true,
      mkdtempSync: prefix => prefix + 'test', chmodSync() {}, copyFileSync() {},
      rmSync: path => cleanup.push(path),
    },
    os: { tmpdir: () => '/tmp/user space' },
    './paths': { coreBinaryPath: () => '/tmp/.mount_app/resources/core/mihomo', helperBinaryPath: () => '/tmp/.mount_app/resources/helper/cheezy-helper' },
    './logger': { log() {} },
    http: { request: (options, callback) => {
      const req = new EventEmitter()
      req.destroy = error => { req.emit('error', error); req.emit('close') }
      req.end = payload => {
        requests.push({ ...options, payload: payload && JSON.parse(payload) })
        process.nextTick(() => {
          if (!installed) { req.destroy(Object.assign(new Error('missing socket'), { code: 'ENOENT' })); return }
          const res = new EventEmitter()
          res.statusCode = 200; res.setEncoding = () => {}
          callback(res)
          res.emit('data', options.path === '/ping' ? JSON.stringify({ identity: 'CheezyHelper/Linux/2', core_hash: currentHash, helper_hash: hash, network_ns: namespace }) : '')
          res.emit('end'); req.emit('close')
        })
      }
      return req
    } },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'process', compiled)(
    name => mocks[name] ?? nativeRequire(name), module, module.exports, { getuid: () => 1000, env: {} },
  )
  return { api: module.exports, calls, requests, cleanup }
}

let f = fixture()
assert.equal(await f.api.ensureLinuxHelper(), true)
assert.equal(f.calls.length, 0, 'Existing matching helper must not request authorization')
const config = '/home/user/a "quoted" $ config.yaml'
assert.equal(await f.api.startLinuxCore(config, '/home/user/core', '/home/user/core:/home/user/profiles'), true)
assert.equal(f.requests.at(-1).payload.config, config, 'Paths must remain structured JSON, never shell arguments')
assert.equal(f.requests.at(-1).payload.path, undefined, 'Client cannot select an executable')
await f.api.stopLinuxCore()
assert.equal(f.requests.at(-1).path, '/stop')

for (const options of [{ installed: false }, { currentHash: 'b'.repeat(64) }]) {
  f = fixture(options)
  assert.deepEqual(await Promise.all([f.api.ensureLinuxHelper(), f.api.ensureLinuxHelper()]), [true, true])
  assert.equal(f.calls.length, 1, 'Concurrent setup must share one authorization')
  assert.equal(f.calls[0].file, '/usr/bin/pkexec')
  assert.equal(f.calls[0].args[1], '--install')
  assert.equal(f.calls[0].args[2], '1000')
  assert.ok(!f.calls[0].args.some(arg => arg.includes('.mount_app')), 'Root should receive staged paths outside FUSE')
  assert.equal(f.cleanup.length, 1)
}
f = fixture({ installed: false, container: true })
assert.equal(await f.api.ensureLinuxHelper(), false)
assert.match(f.api.linuxHelperError(), /outside Distrobox/)
assert.equal(f.calls.length, 0)
f = fixture({ container: true })
assert.equal(await f.api.ensureLinuxHelper(), true, 'An accessible host helper may be reused from a shared-network container')
assert.match(f.requests[0].socketPath, /^\/run\/host\/run\//)
f = fixture({ namespace: 'net:[2]' })
assert.equal(await f.api.ensureLinuxHelper(), false)
assert.match(f.api.linuxHelperError(), /host network namespace/)
assert.equal(f.calls.length, 0)
f = fixture({ installed: false, failInstall: true })
assert.equal(await f.api.ensureLinuxHelper(), false)
assert.match(f.api.linuxHelperError(), /authorization cancelled/)
assert.equal(f.cleanup.length, 1)
f = fixture({ installed: false, systemd: false })
assert.equal(await f.api.ensureLinuxHelper(), false)
assert.match(f.api.linuxHelperError(), /systemd/)
assert.equal(f.calls.length, 0)
console.log('Linux helper: setup, upgrades, cancellation, literal paths, namespace and container boundaries passed')
