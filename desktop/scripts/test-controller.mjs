import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import yaml from 'js-yaml'
import {
  applyControllerDefaults,
  controllerRequiresRestart,
  readControllerConfig,
  zashboardUrl,
} from '../src/main/controller-config.ts'
import { DEFAULT_SETTINGS } from '../src/shared/types.ts'

const desktop = fileURLToPath(new URL('..', import.meta.url))
const root = mkdtempSync(join(tmpdir(), 'cheezy-controller-test-'))
const originalFetch = globalThis.fetch

// Compile production modules in memory, replacing only OS/Electron boundaries.
// No Electron process, browser, helper service or real controller is started.
async function loadModule(entry, mocks) {
  const cache = new Map()
  function compile(filename, source = readFileSync(filename, 'utf8')) {
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }
    cache.set(filename, module)
    const compiled = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText
    const localRequire = specifier => {
      if (Object.hasOwn(mocks, specifier)) {
        return compile(join(desktop, 'mock-' + specifier.replace(/[^a-z0-9]/gi, '_') + '.ts'), mocks[specifier])
      }
      if (specifier.startsWith('.')) {
        const path = resolve(dirname(filename), specifier)
        return compile(path.endsWith('.ts') ? path : path + '.ts')
      }
      return createRequire(filename)(specifier)
    }
    new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports)
    return module.exports
  }
  return compile(join(desktop, 'src/main', entry))
}

try {
  for (const value of ['CheezyVPN', '', 'space + & ? # / % " юникод']) {
    const doc = { secret: value }
    applyControllerDefaults(doc)
    assert.equal(doc.secret, value)
    assert.equal(doc['external-controller'], '127.0.0.1:9090')
    assert.equal(doc['external-ui'], 'ui')
    assert.match(doc['external-ui-url'], /zashboard\/releases\/latest\/download\/.+\.zip$/)
    const controller = readControllerConfig(yaml.dump(doc))
    assert.equal(controller.secret, value)
    const url = new URL(zashboardUrl(controller))
    assert.equal(url.origin, 'http://127.0.0.1:9090')
    assert.equal(url.search, '', 'secret must never appear in the HTTP query')
    assert.match(url.hash, /^#\/setup\?/)
    const params = new URLSearchParams(url.hash.split('?')[1])
    assert.equal(params.get('secret'), value)
    assert.equal(params.get('protocol'), 'http')
    assert.equal(params.get('hostname'), '127.0.0.1')
    assert.equal(params.get('port'), '9090')
  }
  const missing = {}
  applyControllerDefaults(missing)
  assert.equal(Object.hasOwn(missing, 'secret'), false, 'absent secret must not be generated')
  assert.equal(readControllerConfig(yaml.dump(missing)).secret, '')
  assert.equal(readControllerConfig('secret: null').secret, '')
  const custom = { secret: 'own', 'external-ui': 'custom-ui', 'external-ui-url': 'https://example.invalid/ui.zip' }
  applyControllerDefaults(custom)
  assert.equal(custom['external-ui'], 'custom-ui')
  assert.equal(custom['external-ui-url'], 'https://example.invalid/ui.zip')
  assert.throws(() => applyControllerDefaults({ secret: { private: 'DO_NOT_LEAK' } }), (error) =>
    !String(error).includes('DO_NOT_LEAK'))
  assert.throws(() => readControllerConfig('secret: [DO_NOT_LEAK'), (error) =>
    !String(error).includes('DO_NOT_LEAK'))
  const current = { profileId: 'A', secret: 'A', externalUi: 'ui', externalUiName: '' }
  assert.equal(controllerRequiresRestart(current, 'A', { ...current }), false)
  assert.equal(controllerRequiresRestart(current, 'B', { ...current }), true)
  assert.equal(controllerRequiresRestart(current, 'A', { ...current, secret: 'B' }), true)
  assert.equal(controllerRequiresRestart(current, 'A', { ...current, externalUi: 'new-ui' }), true)
  assert.equal(new URL(zashboardUrl({ ...current, externalUiName: 'zash' })).pathname, '/ui/zash/')

  // Actual HTTP-client methods must retain the applied secret and never reload
  // it from a global preference or a newly edited profile behind the caller's back.
  const { MihomoApi } = await loadModule('mihomo-api.ts', {
    './logger': 'export const log = () => {}',
  })
  const requests = []
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init })
    return new Response(JSON.stringify({ version: 'test', proxies: {}, downloadTotal: 0, uploadTotal: 0 }))
  }
  const api = new MihomoApi()
  api.setAuth('127.0.0.1', 9090, 'profile-A')
  await api.getVersion()
  await api.getProxies()
  await api.selectProxy('group', 'proxy')
  await api.healthCheck('group')
  await api.getTraffic()
  assert.ok(requests.every(({ init }) => init.headers.Authorization === 'Bearer profile-A'))
  const reloadFile = join(root, 'api-reload.yaml')
  writeFileSync(reloadFile, 'secret: profile-B\n')
  const before = requests.length
  await assert.rejects(api.putConfigs(reloadFile), /requires a core restart/)
  assert.equal(requests.length, before, 'different secret must not be soft-reloaded')
  assert.equal(api.getSecret(), 'profile-A')
  writeFileSync(reloadFile, 'secret: profile-A\n')
  await api.putConfigs(reloadFile)
  assert.equal(requests.at(-1).init.headers.Authorization, 'Bearer profile-A')
  api.setAuth('127.0.0.1', 9090, '')
  await api.getVersion()
  assert.equal(Object.hasOwn(requests.at(-1).init.headers, 'Authorization'), false)

  // Real lifecycle coordinator and core-manager; OS start/stop are simulations.
  const fixture = {
    active: 'A', documents: { A: { secret: 'profile-A' }, B: { secret: '' } },
    settings: { ...DEFAULT_SETTINGS, networkOverrideEnabled: true, systemProxy: false },
    saved: { controllerSecret: 'ignored-legacy-global', controllerRuntime: null },
    clientSecret: '', serverSecret: 'legacy-generated', running: true,
    spawns: [], puts: [], logs: [], helperStarts: 0, failPut: false, validation: null,
    configPath(id) { return join(root, `${id}.yaml`) },
    rebuild(id) {
      const doc = structuredClone(this.documents[id])
      applyControllerDefaults(doc)
      writeFileSync(this.configPath(id), yaml.dump(doc))
      return this.configPath(id)
    },
    spawn(_bin, args) {
      const path = args[args.indexOf('-f') + 1]
      this.serverSecret = readControllerConfig(readFileSync(path, 'utf8')).secret
      this.running = true
      this.spawns.push(this.serverSecret)
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.exitCode = null
      child.signalCode = null
      child.kill = () => { child.signalCode = 'SIGTERM'; this.running = false }
      return child
    },
    startHelper(args) {
      const path = args.match(/-f "([^"]+)"/)[1]
      this.serverSecret = readControllerConfig(readFileSync(path, 'utf8')).secret
      this.spawns.push(this.serverSecret)
      this.running = true
      this.helperStarts++
      return true
    },
  }
  globalThis.__controllerFixture = fixture
  const prelude = 'const f = globalThis.__controllerFixture;'
  const core = await loadModule('core-manager.ts', {
    electron: 'export const BrowserWindow = {getAllWindows: () => []}',
    child_process: `${prelude} export const spawn = (...args) => f.spawn(...args)`,
    os: 'export const platform = () => "linux"',
    './store': `${prelude}
      export const store = {get: k => f.saved[k], set: (k,v) => f.saved[k] = v};
      export const getSettings = () => f.settings;
      export const setSettings = patch => Object.assign(f.settings, patch);
      export const getSelections = () => ({});
      export const isSystemProxyOwned = () => false;
      export const setSystemProxyOwned = () => {};`,
    './paths': `export const coreBinaryPath = () => ${JSON.stringify(reloadFile)};
      export const coreHome = () => ${JSON.stringify(root)};
      export const profilesRoot = coreHome;
      export const bundledCoreDir = coreHome;
      export const wintunPath = coreHome;
      export const mihomoSafePaths = coreHome;
      export const corePresent = () => true;`,
    './profiles': `${prelude}
      export const rebuildConfig = id => f.rebuild(id);
      export const activeConfigPath = () => f.configPath(f.active);
      export const getActiveProfileId = () => f.active;
      export const resolveProfileNetwork = () => ({mode: f.settings.connectionMode});
      export const readEffectiveNetworkConfig = resolveProfileNetwork;
      export const setReloadActiveCoreHook = hook => f.reloadHook = hook;
      export const validateGeneratedConfig = async () => {
        const barrier = f.validation; f.validation = null;
        if (barrier) { barrier.enter(); await barrier.wait; }
        return [];
      };`,
    './mihomo-api': `${prelude} export const mihomoApi = {
      stopTraffic: () => {},
      setAuth: (_host, _port, secret) => { f.clientSecret = secret; },
      getSecret: () => f.clientSecret,
      ping: async () => f.running && f.clientSecret === f.serverSecret,
      waitReady: async () => { if (f.clientSecret !== f.serverSecret) throw Error('auth mismatch'); },
      putConfigs: async path => { if (f.failPut) throw Error('reload failed'); f.puts.push(path); },
      applySelections: async () => {}, closeAllConnections: async () => {},
    };`,
    './helper': `${prelude}
      export const pingHelper = async () => true;
      export const stopCoreByHelper = async () => { f.running = false; };
      export const startCoreByHelper = async args => f.startHelper(args);
      export const ensureHelper = async () => {};
      export const queryWindowsService = async () => 'none';
      export const replaceCoreViaHelper = async () => false;
      export const sha256File = () => 'unused';`,
    './privileges': 'export const authorizeForTun = async () => true; export const privilegesOk = authorizeForTun;',
    './system-proxy': 'export const setSystemProxy = async () => {};',
    './logger': `${prelude} export const log = message => f.logs.push(message);`,
  })

  writeFileSync(fixture.configPath('A'), 'secret: legacy-generated\nexternal-ui: ui\n')
  core.restoreControllerAuth()
  assert.equal(fixture.saved.controllerRuntime.secret, 'legacy-generated')
  assert.equal((await core.getStatus()).secret, 'legacy-generated', 'upgrade must reconnect to the actual running config')
  assert.equal((await core.getStatus()).running, true)
  await core.connect()
  assert.deepEqual(fixture.spawns, ['profile-A'])
  assert.equal(fixture.saved.controllerRuntime.secret, 'profile-A')
  assert.equal((await core.getStatus()).secret, 'profile-A')

  fixture.documents.A.secret = 'new-profile-A'
  const path = fixture.rebuild('A') // auto-update without apply
  assert.equal((await core.getStatus()).secret, 'profile-A')
  core.restoreControllerAuth() // simulate main-process recovery from persisted snapshot
  assert.equal((await core.getStatus()).secret, 'profile-A')
  assert.equal(new URLSearchParams(new URL(await core.getDashboardUrl()).hash.split('?')[1]).get('secret'), 'profile-A')

  await core.reloadActiveConfig(path, 'A')
  assert.deepEqual(fixture.spawns, ['profile-A', 'new-profile-A'], 'changed secret must restart')
  assert.equal(fixture.puts.length, 0)
  assert.equal((await core.getStatus()).secret, 'new-profile-A')
  await core.reloadActiveConfig(path, 'A')
  assert.equal(fixture.puts.length, 1, 'unchanged controller must still soft reload')
  assert.equal(fixture.spawns.length, 2)
  fixture.failPut = true
  await assert.rejects(core.reloadActiveConfig(path, 'A'), /reload failed/)
  assert.equal((await core.getStatus()).secret, 'new-profile-A')
  fixture.failPut = false

  fixture.active = 'B'
  await core.switchProfile('B')
  assert.equal((await core.getStatus()).secret, '')
  assert.equal(fixture.saved.controllerRuntime.profileId, 'B')
  const setup = new URL(await core.getDashboardUrl())
  assert.equal(new URLSearchParams(setup.hash.split('?')[1]).get('secret'), '')
  assert.ok(!fixture.logs.some(line => line.includes('new-profile-A') || line.includes('profile-A')))

  await core.disconnect()
  await assert.rejects(core.getDashboardUrl(), /Start the VPN/)
  const stoppedCount = fixture.spawns.length
  await core.reloadActiveConfig(fixture.configPath('B'), 'B')
  assert.equal(fixture.spawns.length, stoppedCount, 'reload must not resurrect a stopped VPN')

  let enter
  const entered = new Promise(done => { enter = done })
  let release
  const wait = new Promise(done => { release = done })
  fixture.active = 'A'
  fixture.validation = { enter, wait }
  const pendingA = core.connect(undefined, 'cold-start', 'A')
  await entered
  fixture.active = 'B'
  const pendingB = core.switchProfile('B')
  release()
  await Promise.all([pendingA, pendingB])
  assert.deepEqual(fixture.spawns.slice(stoppedCount), [''], 'stale profile must never install its credentials')
  assert.equal(fixture.saved.controllerRuntime.profileId, 'B')
  await core.disconnect()

  fixture.settings.connectionMode = 'tun'
  await core.connect('tun', 'cold-start', 'B')
  assert.equal(fixture.helperStarts, 1, 'helper launch must use the same YAML credentials')
  assert.equal(fixture.clientSecret, '')
  assert.equal((await core.getStatus()).running, true)
  await core.disconnect()

  const profilesSource = readFileSync(join(desktop, 'src/main/profiles.ts'), 'utf8')
  const apiSource = readFileSync(join(desktop, 'src/main/mihomo-api.ts'), 'utf8')
  const indexSource = readFileSync(join(desktop, 'src/main/index.ts'), 'utf8')
  assert.ok(!profilesSource.includes('doc.secret ='))
  assert.ok(!apiSource.includes('ensureSecretFromStore'))
  assert.ok(!indexSource.includes('putConfigs('), 'IPC reloads must use the lifecycle coordinator')
  assert.ok(indexSource.includes("ipcMain.handle('dashboard:open'"))
  assert.ok(existsSync(reloadFile))
  console.log('desktop controller config, HTTP auth, lifecycle and Zashboard tests passed')
} finally {
  globalThis.fetch = originalFetch
  delete globalThis.__controllerFixture
  assert.equal(dirname(resolve(root)), resolve(tmpdir()))
  assert.ok(root.startsWith(join(tmpdir(), 'cheezy-controller-test-')))
  rmSync(root, { recursive: true, force: true })
}
