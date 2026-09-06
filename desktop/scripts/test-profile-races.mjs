import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const desktop = fileURLToPath(new URL('..', import.meta.url))
const temporaryRoot = mkdtempSync(join(tmpdir(), 'cheezy-profile-races-'))
const originalFetch = globalThis.fetch
let scenario = 0

// Run the entire production profiles module and its YAML transformations.
// Only Electron, persistent app state, core boundaries and HTTP are replaced.
function harness() {
  const root = join(temporaryRoot, String(++scenario))
  const values = { profiles: [], activeProfileId: null }
  const store = {
    get: key => structuredClone(values[key]),
    set: (key, value) => { values[key] = structuredClone(value) },
  }
  const requests = []
  globalThis.fetch = (url) => new Promise((resolveRequest, reject) => {
    requests.push({
      url,
      reject,
      reply(name, body = 'proxies: []\n') {
        resolveRequest({
          ok: true, url,
          headers: new Headers({ 'profile-title': name, 'profile-update-interval': '1' }),
          text: async () => body,
        })
      },
    })
  })
  const cache = new Map()
  const mocks = {
    electron: { app: { getVersion: () => 'test' }, dialog: {} },
    './private-module': { getPrivateModule: () => ({ capabilities: () => ({ supportsAuth: false }) }) },
    './logger': { log() {} },
    './mihomo-api': { mihomoApi: {} },
    './store': { store, getSettings: () => load(join(desktop, 'src/shared/types.ts')).DEFAULT_SETTINGS, getSelections: () => ({}) },
    './paths': {
      profilesRoot: () => root,
      profileDir: id => join(root, id),
      corePresent: () => false,
    },
  }
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }
    cache.set(filename, module)
    const js = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText
    const require = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name]
      if (name.startsWith('.')) {
        const path = resolve(dirname(filename), name)
        return load(path.endsWith('.ts') ? path : `${path}.ts`)
      }
      return createRequire(filename)(name)
    }
    new Function('require', 'module', 'exports', js)(require, module, module.exports)
    return module.exports
  }
  const api = load(join(desktop, 'src/main/profiles.ts'))
  async function requestAt(index) {
    for (let i = 0; i < 50 && !requests[index]; i++) await new Promise(resolve => setImmediate(resolve))
    assert.ok(requests[index], `request ${index} must start`)
    return requests[index]
  }
  async function add(name) {
    const index = requests.length
    const result = api.importFromUrl(`https://example.invalid/${name}`, name)
    ;(await requestAt(index)).reply(name)
    return result
  }
  const readBase = id => readFileSync(join(root, id, 'base.yaml'), 'utf8')
  return { api, store, root, requests, requestAt, add, readBase }
}

try {
  {
    const h = harness()
    const a = await h.add('A')
    const b = await h.add('B')
    const update = h.api.refreshProfile(a.id, { reloadCore: false })
    const request = await h.requestAt(2)
    const c = await h.add('C')
    h.api.deleteProfile(b.id)
    request.reply('A updated')
    await update
    assert.deepEqual(h.api.listProfiles().map(p => p.id), [a.id, c.id])
    assert.equal(h.api.listProfiles()[0].name, 'A updated')
    assert.ok(!existsSync(join(h.root, b.id)))
    console.log('PASS: update preserves concurrent import and deletion')
  }
  {
    const h = harness()
    const a = await h.add('A')
    const update = h.api.refreshProfile(a.id, { reloadCore: true })
    const rejected = assert.rejects(update, /deleted or replaced/)
    const request = await h.requestAt(1)
    const queued = assert.rejects(h.api.refreshProfile(a.id, { reloadCore: true }), /deleted or replaced/)
    let reloads = 0
    h.api.setReloadActiveCoreHook(async () => { reloads++ })
    h.api.deleteProfile(a.id)
    request.reply('stale')
    await Promise.all([rejected, queued])
    assert.deepEqual(h.api.listProfiles(), [])
    assert.equal(h.api.getActiveProfileId(), null)
    assert.ok(!existsSync(join(h.root, a.id)), 'late response must not recreate deleted files')
    assert.equal(reloads, 0)
    assert.equal(h.requests.length, 2, 'deleted queued work must not download')
    console.log('PASS: deletion invalidates download and queued updates before disk writes')
  }
  {
    const h = harness()
    const a = await h.add('A')
    let finishReload
    let reloads = 0
    h.api.setReloadActiveCoreHook(() => {
      reloads++
      return new Promise(resolve => { finishReload = resolve })
    })
    const first = h.api.refreshProfile(a.id, { reloadCore: true })
    const request = await h.requestAt(1)
    const second = h.api.refreshProfile(a.id, { reloadCore: false })
    request.reply('first', 'proxies: []\nmode: direct\n')
    for (let i = 0; i < 50 && !finishReload; i++) await new Promise(resolve => setImmediate(resolve))
    assert.ok(finishReload)
    assert.equal(h.requests.length, 2, 'next update waits for the previous core reload')
    finishReload()
    await first
    ;(await h.requestAt(2)).reply('second', 'proxies: []\nmode: rule\n')
    await second
    assert.equal(h.api.listProfiles()[0].name, 'second')
    assert.match(h.readBase(a.id), /mode: rule/)
    assert.equal(reloads, 1, 'background update must not reload core')
    console.log('PASS: same-profile updates and core reloads are serialized')
  }
  {
    const h = harness()
    const a = await h.add('A')
    const b = await h.add('B')
    const first = h.api.refreshProfile(a.id, { reloadCore: false })
    const second = h.api.refreshProfile(b.id, { reloadCore: false })
    const firstRequest = await h.requestAt(2)
    ;(await h.requestAt(3)).reply('B updated')
    await second
    firstRequest.reply('A updated')
    await first
    assert.deepEqual(h.api.listProfiles().map(p => p.name), ['A updated', 'B updated'])
    console.log('PASS: different-profile replies preserve each other in reverse order')
  }
  {
    const h = harness()
    const a = await h.add('A')
    const failed = assert.rejects(h.api.refreshProfile(a.id, { reloadCore: false }), /offline/)
    const request = await h.requestAt(1)
    const next = h.api.refreshProfile(a.id, { reloadCore: false })
    request.reject(new Error('offline'))
    await failed
    ;(await h.requestAt(2)).reply('recovered')
    await next
    assert.equal(h.api.listProfiles()[0].name, 'recovered')
    console.log('PASS: failed request does not poison the queue')
  }
  {
    const h = harness()
    const initial = h.api.upsertManagedProfile('https://example.invalid/old', 'managed')
    ;(await h.requestAt(0)).reply('managed')
    const a = await initial
    const stale = assert.rejects(h.api.refreshProfile(a.id, { reloadCore: true }), /deleted or replaced/)
    const staleRequest = await h.requestAt(1)
    const replacement = h.api.upsertManagedProfile('https://example.invalid/new', 'new managed')
    ;(await h.requestAt(2)).reply('new managed', 'proxies: []\nmode: rule\n')
    await replacement
    // A new queue can start before the invalidated request finishes.
    const fresh = h.api.refreshProfile(a.id, { reloadCore: false })
    const freshRequest = await h.requestAt(3)
    assert.equal(freshRequest.url, 'https://example.invalid/new')
    staleRequest.reply('stale', 'proxies: []\nmode: direct\n')
    await stale
    freshRequest.reply('fresh', 'proxies: []\nmode: rule\n')
    await fresh
    assert.equal(h.api.listProfiles()[0].name, 'fresh')
    assert.equal(h.api.listProfiles()[0].url, 'https://example.invalid/new')
    assert.match(h.readBase(a.id), /mode: rule/)
    console.log('PASS: account replacement invalidates old replies without removing the new queue')
  }
} finally {
  globalThis.fetch = originalFetch
  const target = resolve(temporaryRoot)
  assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target !== resolve(tmpdir()))
  rmSync(target, { recursive: true, force: true })
}

console.log('desktop profile race tests passed')
