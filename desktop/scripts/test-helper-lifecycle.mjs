import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

const nativeRequire = createRequire(import.meta.url)
const source = readFileSync(new URL('../src/main/helper.ts', import.meta.url), 'utf8')
const calls = [], logs = []
let platform = 'win32', packaged = false, failStart = false, failStop = false
const exec = async (file, args, options) => {
  calls.push({ file, args, options })
  if (args.includes('StartHelper') && failStart) throw new Error('migration required')
  if (args.includes('StopHelper') && failStop) throw new Error('access denied')
  if (args.includes('-EncodedCommand')) failStart = false
  return { stdout: '', stderr: '' }
}
const module = { exports: {} }
const mocks = {
  electron: { app: { get isPackaged() { return packaged } } },
  util: { promisify: () => exec },
  os: { platform: () => platform },
  fs: { existsSync: () => true, mkdirSync: () => {}, writeFileSync: () => {}, readFileSync: () => Buffer.from('fixture') },
  '../shared/types': { HELPER_PORT: 12345, HELPER_IDENTITY: 'CheezyHelper/test' },
  './paths': { helperBinaryPath: () => "C:\\Apps\\User's $ VPN\\resources\\helper\\CheezyHelperService.exe",
    coreBinaryPath: () => 'C:\\fixture\\mihomo.exe' },
  './logger': { log: (...args) => logs.push(args) },
}
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText
new Function('require', 'module', 'exports', compiled)(name => mocks[name] ?? nativeRequire(name), module, module.exports)
const helper = module.exports
const originalFetch = globalThis.fetch
const resourcesDescriptor = Object.getOwnPropertyDescriptor(process, 'resourcesPath')
globalThis.fetch = async () => new Response('CheezyHelper/test')
try {
  await helper.stopHelperOnExit()
  assert.equal(calls.length, 1)
  assert.ok(calls[0].args.includes('StopHelper'))
  assert.equal(calls[0].options.windowsHide, true)
  assert.equal(calls[0].options.timeout, 20_000)
  assert.equal(calls[0].args[calls[0].args.indexOf('-InstallDir') + 1], "C:\\Apps\\User's $ VPN")
  assert.equal(calls[0].args[calls[0].args.indexOf('-File') + 1], "C:\\Apps\\User's $ VPN\\build\\installer-processes.ps1")
  failStop = true
  await helper.stopHelperOnExit()
  assert.ok(logs.some(args => String(args[0]).includes('access denied')))
  assert.ok(!calls.some(call => call.args.includes('-EncodedCommand')), 'Exit must never prompt for elevation')
  calls.length = 0
  platform = 'linux'
  await helper.stopHelperOnExit()
  assert.equal(calls.length, 0)
  platform = 'win32'
  assert.equal(await helper.tryStartExistingService(), true)
  assert.ok(calls.at(-1).args.includes('StartHelper'))
  failStart = true
  assert.equal(await helper.installWindowsHelper(), true)
  const repair = calls.find(call => call.args.includes('-EncodedCommand'))
  const wrapper = Buffer.from(repair.args.at(-1), 'base64').toString('utf16le')
  assert.match(wrapper, /-Verb RunAs -WindowStyle Hidden -Wait -PassThru/)
  assert.match(wrapper, /User''s \$ VPN/)
  assert.match(wrapper, /RepairHelper/)
  assert.ok(!wrapper.includes('cmd.exe'), 'No shell chain or service delete')
  Object.defineProperty(process, 'resourcesPath', { configurable: true, value: 'C:\\Packaged\\resources' })
  packaged = true; failStop = false
  await helper.stopHelperOnExit()
  assert.ok(calls.at(-1).args.includes('C:\\Packaged\\resources\\helper-control.ps1'))
  console.log('Helper client lifecycle: path scoping, bounded exit, restart and one-time repair passed (mock OS)')
} finally {
  globalThis.fetch = originalFetch
  if (resourcesDescriptor) Object.defineProperty(process, 'resourcesPath', resourcesDescriptor)
  else delete process.resourcesPath
}
// Exercise the production quit handler, including repeated before-quit events.
const index = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
const begin = index.indexOf("  app.on('before-quit',")
const end = index.indexOf('\n  })', begin) + '\n  })'.length
const handlerSource = index.slice(begin, end)
let onQuit, finishDisconnect, disconnectCalls = 0, helperStops = 0, quitCalls = 0
const order = []
new Function('app', 'stopSubscriptionUpdater', 'disconnect', 'stopHelperOnExit', 'log',
  'let quitCleanupDone = false, quitCleanupStarted = false, quitting = false;\n' + handlerSource)(
  { on: (_, handler) => { onQuit = handler }, quit: () => { quitCalls++ } },
  () => order.push('updater'),
  () => { disconnectCalls++; order.push('disconnect'); return new Promise(resolve => { finishDisconnect = resolve }) },
  async () => { helperStops++; order.push('helper') }, () => {},
)
onQuit({ preventDefault() {} }); onQuit({ preventDefault() {} })
assert.equal(disconnectCalls, 1)
assert.equal(helperStops, 0, 'Do not stop helper before disconnect and proxy restoration')
finishDisconnect()
await new Promise(resolve => setImmediate(resolve))
assert.deepEqual(order, ['updater', 'disconnect', 'helper'])
assert.equal(quitCalls, 1)
onQuit({ preventDefault() { assert.fail('Final quit must be allowed') } })
assert.equal(helperStops, 1)
console.log('Production quit handler: disconnect ordering and repeated exit events passed')
