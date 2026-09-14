import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { WindowsProxyState, WINDOWS_PROXY_KEYS, WINDOWS_PROXY_BYPASS, parseWindowsProxyValues } from '../src/main/windows-proxy-state.ts'

const str = data => ({ type: 'REG_SZ', data })
const dword = data => ({ type: 'REG_DWORD', data: String(data) })
const original = { ProxyServer: str('proxy.company:8080'), ProxyOverride: str('*.internal;<local>'), ProxyEnable: dword(1) }
const appState = port => ({ ProxyServer: str(`127.0.0.1:${port}`), ProxyOverride: str(WINDOWS_PROXY_BYPASS), ProxyEnable: dword(1) })
let passed = 0

function fixture(initial = original) {
  let current = structuredClone(initial)
  let saved = null
  let beforeWrite = null
  const writes = []
  const adapter = {
    read: async () => structuredClone(current),
    write: async (key, value) => {
      beforeWrite?.(key, value)
      writes.push([key, structuredClone(value)])
      current[key] = structuredClone(value)
    },
    load: () => structuredClone(saved),
    save: value => { saved = structuredClone(value) },
  }
  return {
    adapter, controller: () => new WindowsProxyState(adapter), writes,
    get current() { return structuredClone(current) },
    set current(value) { current = structuredClone(value) },
    get saved() { return structuredClone(saved) },
    set saved(value) { saved = structuredClone(value) },
    set beforeWrite(value) { beforeWrite = value },
  }
}
async function test(name, fn) { await fn(); passed++; console.log(`PASS: ${name}`) }

await test('restores a configured proxy, its exclusions, and enabled state after restart', async () => {
  const h = fixture()
  await h.controller().enable(7890)
  assert.deepEqual(h.current, appState(7890))
  assert.deepEqual(h.saved.before, original)
  assert.equal(await h.controller().restore(), true)
  assert.deepEqual(h.current, original)
  assert.equal(h.saved, null)
})

await test('preserves missing, empty, disabled, Unicode and expandable values', async () => {
  for (const initial of [
    { ProxyServer: null, ProxyOverride: null, ProxyEnable: null },
    { ProxyServer: str(''), ProxyOverride: str(''), ProxyEnable: dword(0) },
    { ProxyServer: { type: 'REG_EXPAND_SZ', data: '%PROXY_HOST%:8080' }, ProxyOverride: str(' сеть.local;例子.test; '), ProxyEnable: dword(0) },
  ]) {
    const h = fixture(initial)
    await h.controller().enable(7890)
    await h.controller().restore()
    assert.deepEqual(h.current, initial)
    assert.deepEqual(parseWindowsProxyValues(JSON.stringify(initial)), initial)
  }
  assert.throws(() => parseWindowsProxyValues('{}'), /Invalid/)
  assert.throws(() => parseWindowsProxyValues(JSON.stringify({ ...original, ProxyEnable: str('1') })), /Unsupported/)
})

await test('port changes and repeated enables keep the original baseline', async () => {
  const h = fixture()
  await h.controller().enable(7890)
  const writes = h.writes.length
  await h.controller().enable(7890)
  assert.equal(h.writes.length, writes)
  await h.controller().enable(7891)
  assert.deepEqual(h.saved.before, original)
  await h.controller().restore()
  assert.deepEqual(h.current, original)
})

await test('each externally changed field prevents restoration writes', async () => {
  for (const key of WINDOWS_PROXY_KEYS) {
    const h = fixture()
    await h.controller().enable(7890)
    const changed = { ...h.current, [key]: key === 'ProxyEnable' ? dword(0) : str('external') }
    h.current = changed
    const writes = h.writes.length
    assert.equal(await h.controller().restore(), false)
    assert.deepEqual(h.current, changed)
    assert.equal(h.writes.length, writes)
    assert.equal(h.saved, null)
  }
})

await test('explicit reconnect captures externally changed settings as a new baseline', async () => {
  const h = fixture()
  await h.controller().enable(7890)
  const changed = { ...original, ProxyServer: str('new-proxy:3128') }
  h.current = changed
  await h.controller().enable(7891)
  await h.controller().restore()
  assert.deepEqual(h.current, changed)
})

await test('failed registry writes roll back at every application step', async () => {
  for (const failedKey of WINDOWS_PROXY_KEYS) {
    const initial = { ...original, ProxyEnable: dword(0) }
    const h = fixture(initial)
    h.beforeWrite = key => {
      if (key === failedKey) { h.beforeWrite = null; throw new Error('access denied') }
    }
    await assert.rejects(h.controller().enable(7890), /access denied/)
    assert.deepEqual(h.current, initial)
    assert.equal(h.saved, null)
  }
})

await test('failed rollback retains the journal for retry after restart', async () => {
  const h = fixture()
  h.beforeWrite = (key, value) => {
    if (key === 'ProxyOverride' || (key === 'ProxyServer' && value.data === 'proxy.company:8080')) throw new Error('denied')
  }
  await assert.rejects(h.controller().enable(7890), /Recovery will be retried/)
  assert.ok(h.saved)
  h.beforeWrite = null
  await h.controller().restore()
  assert.deepEqual(h.current, original)
})

await test('restart recovers both sides of an interrupted registry write', async () => {
  for (const committed of [false, true]) {
    const h = fixture()
    const pending = { ...original, ProxyServer: str('127.0.0.1:7890') }
    h.saved = { before: original, applied: original, pending }
    h.current = committed ? pending : original
    await h.controller().restore()
    assert.deepEqual(h.current, original)
    assert.equal(h.saved, null)
  }
})

await test('restart resumes interrupted restoration', async () => {
  const h = fixture()
  const pending = { ...appState(7890), ProxyServer: original.ProxyServer }
  h.saved = { before: original, applied: appState(7890), pending }
  h.current = pending
  await h.controller().restore()
  assert.deepEqual(h.current, original)
})

await test('external changes between writes stop application without overwriting them', async () => {
  const h = fixture()
  const read = h.adapter.read
  let reads = 0
  h.adapter.read = async () => {
    if (++reads === 3) h.current = { ...h.current, ProxyServer: str('external:8080') }
    return read()
  }
  await assert.rejects(h.controller().enable(7890), /another application/)
  assert.equal(h.current.ProxyServer.data, 'external:8080')
  assert.equal(h.writes.length, 1)
})

await test('snapshot persistence failure prevents registry writes', async () => {
  const h = fixture()
  h.adapter.save = () => { throw new Error('disk full') }
  await assert.rejects(h.controller().enable(7890), /disk full/)
  assert.equal(h.writes.length, 0)
})

await test('invalid ports never touch registry or snapshot', async () => {
  const h = fixture()
  for (const port of [0, -1, 65536, 7890.5, NaN]) await assert.rejects(h.controller().enable(port), /Invalid/)
  assert.equal(h.writes.length, 0)
  assert.equal(h.saved, null)
})

function production(h, owned = false) {
  const filename = new URL('../src/main/system-proxy.ts', import.meta.url)
  const realRequire = createRequire(filename)
  const commands = []
  const mockedRequire = name => {
    if (name === './windows-proxy-state') return { WindowsProxyState, WINDOWS_PROXY_BYPASS, parseWindowsProxyValues }
    if (name === './store') return { store: {
      get: key => key === 'windowsProxySnapshot' ? h.saved : owned,
      set: (_key, value) => { h.saved = value },
    } }
    if (name === './logger') return { log() {} }
    if (name === 'util') return { promisify: fn => (...args) => new Promise((resolve, reject) => {
      fn(...args, (error, stdout, stderr) => error ? reject(error) : resolve({ stdout, stderr }))
    }) }
    if (name === 'os') return { platform: () => 'win32' }
    if (name === 'child_process') return { execFile(command, args, options, callback) {
      assert.equal(options.windowsHide, true)
      assert.equal(options.timeout, 10_000)
      commands.push([command, args])
      void (async () => {
        if (command === 'powershell.exe') {
          assert.equal(args[2], '-EncodedCommand')
          const script = Buffer.from(args[3], 'base64').toString('utf16le')
          assert.ok(script.includes('DoNotExpandEnvironmentNames'))
          return JSON.stringify(await h.adapter.read())
        }
        assert.equal(command, 'reg')
        const key = args[3]
        assert.ok(WINDOWS_PROXY_KEYS.includes(key))
        const value = args[0] === 'delete' ? null : { type: args[5], data: args[7] }
        await h.adapter.write(key, value)
        return ''
      })().then(stdout => callback(null, stdout, ''), error => callback(error, '', ''))
    } }
    return realRequire(name)
  }
  const js = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', js)(mockedRequire, module, module.exports)
  return { ...module.exports, commands }
}

await test('production adapter serializes overlapping connect and disconnect', async () => {
  const h = fixture()
  const api = production(h)
  await Promise.all([api.setSystemProxy(true, 7890), api.setSystemProxy(false, 7890)])
  assert.deepEqual(h.current, original)
  assert.equal(h.saved, null)
  assert.equal(api.commands.filter(([command]) => command === 'reg').length, 4)
})

await test('production adapter preserves empty and missing values through registry commands', async () => {
  const initial = { ProxyServer: str(''), ProxyOverride: null, ProxyEnable: null }
  const h = fixture(initial)
  const api = production(h)
  await api.setSystemProxy(true, 7890)
  await api.setSystemProxy(false, 7890)
  assert.deepEqual(h.current, initial)
  assert.ok(api.commands.some(([command, args]) => command === 'reg' && args[0] === 'delete'))
})

await test('legacy cleanup only disables our matching proxy and never an external proxy', async () => {
  const matching = fixture(appState(7890))
  await production(matching, true).setSystemProxy(false, 7890)
  assert.equal(matching.current.ProxyEnable.data, '0')
  for (const initial of [original, { ...appState(7890), ProxyOverride: str('external') }, appState(7891)]) {
    const h = fixture(initial)
    await production(h, true).setSystemProxy(false, 7890)
    assert.deepEqual(h.current, initial)
    assert.equal(h.writes.length, 0)
  }
})

await test('production queue recovers after failure and read errors never cause writes', async () => {
  const h = fixture()
  const api = production(h)
  const read = h.adapter.read
  h.adapter.read = async () => { throw new Error('registry unavailable') }
  await assert.rejects(api.setSystemProxy(true, 7890), /registry unavailable/)
  assert.equal(h.writes.length, 0)
  h.adapter.read = read
  await api.setSystemProxy(true, 7890)
  await production(h).setSystemProxy(false, 7890)
  assert.deepEqual(h.current, original)
})

await test('macOS never passes the explanatory header or disabled services to networksetup', async () => {
  for (const header of ['An asterisk (*) denotes that a network service is disabled.', 'Звёздочка (*) обозначает отключённую сетевую службу.']) {
    const filename = new URL('../src/main/system-proxy.ts', import.meta.url)
    const realRequire = createRequire(filename)
    const commands = []
    const mockedRequire = name => {
      if (name === './windows-proxy-state') return { WindowsProxyState, WINDOWS_PROXY_BYPASS, parseWindowsProxyValues }
      if (name === './store') return { store: {} }
      if (name === './logger') return { log() {} }
      if (name === 'os') return { platform: () => 'darwin' }
      if (name === 'util') return { promisify: () => async (command, args) => {
        assert.equal(command, 'networksetup')
        commands.push(args)
        return { stdout: args[0] === '-listallnetworkservices' ? `\r\n${header}\r\nWi-Fi\r\n*Disabled\r\nUSB LAN\r\n` : '' }
      } }
      return realRequire(name)
    }
    const js = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
    const module = { exports: {} }
    new Function('require', 'module', 'exports', js)(mockedRequire, module, module.exports)
    await module.exports.setSystemProxy(true, 7890)
    await module.exports.setSystemProxy(false, 7890)
    const writes = commands.filter(args => args[0] !== '-listallnetworkservices')
    assert.equal(writes.length, 18)
    assert.deepEqual([...new Set(writes.map(args => args[1]))], ['Wi-Fi', 'USB LAN'])
  }
})

console.log(`${passed} system proxy scenarios passed (no host settings changed)`)
