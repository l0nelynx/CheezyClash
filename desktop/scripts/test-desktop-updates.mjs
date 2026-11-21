import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'
import * as manifest from '../src/main/update-manifest.ts'

const require = createRequire(import.meta.url)
const scratch = await mkdtemp(join(tmpdir(), 'cheezy-desktop-updates-'))
const key = generateKeyPairSync('ed25519')
const publicKey = key.publicKey.export({ type: 'spki', format: 'pem' })
const signingEnv = { ...process.env, DESKTOP_UPDATE_PUBLIC_KEY: publicKey,
  DESKTOP_UPDATE_PRIVATE_KEY: key.privateKey.export({ type: 'pkcs8', format: 'pem' }) }
const formats = [
  ['win', 'win32', 'x64', 'nsis', 'win-x64.exe'], ['win', 'win32', 'x64', 'zip', 'win-x64.zip'],
  ['linux', 'linux', 'x64', 'AppImage', 'linux-x86_64.AppImage'], ['linux', 'linux', 'x64', 'deb', 'linux-amd64.deb'],
  ...['arm64', 'x64'].flatMap(arch => ['dmg', 'zip'].map(ext => ['mac-' + arch, 'darwin', arch, ext, 'mac-' + arch + '.' + ext])),
]
const source = ts.transpileModule(await readFile(new URL('../src/main/desktop-updates.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

async function testEdition(edition) {
  const root = join(scratch, edition)
  for (const [dir, , , , suffix] of formats) {
    await mkdir(join(root, edition + '-desktop-' + dir), { recursive: true })
    await writeFile(join(root, edition + '-desktop-' + dir, edition + '-' + suffix), suffix)
  }
  const signRelease = () => execFileSync(process.execPath, ['scripts/sign-desktop-release.mjs', root, edition, 'v1.7.5'], { env: signingEnv, stdio: 'pipe' })
  signRelease()
  const raw = await readFile(join(root, 'desktop-update/desktop-update.json'))
  const signature = await readFile(join(root, 'desktop-update/desktop-update.sig'))
  for (const [dir, platform, arch, format, suffix] of formats) {
    const file = manifest.selectAsset(raw, signature, publicKey, edition, '1.7.5', platform, arch, format)
    assert.equal(file.name, edition + '-' + suffix)
    await manifest.verifyFile(join(root, edition + '-desktop-' + dir, file.name), file)
  }
  const select = (bytes, sig, product = edition, version = '1.7.5') =>
    manifest.selectAsset(bytes, sig, publicKey, product, version, 'darwin', 'x64', 'dmg')
  assert.throws(() => select(raw, signature, edition === 'CheezyVPN' ? 'CheezyClash' : 'CheezyVPN'))
  assert.throws(() => select(raw, signature, edition, '1.7.6'))
  assert.throws(() => select(raw, sign(null, raw, generateKeyPairSync('ed25519').privateKey)))
  assert.throws(() => select(Buffer.concat([raw, Buffer.from(' ')]), signature))
  const data = JSON.parse(raw)
  data.files.push(data.files.find(f => f.platform === 'darwin' && f.format === 'dmg' && f.arch === 'x64'))
  const duplicate = Buffer.from(JSON.stringify(data))
  assert.throws(() => select(duplicate, sign(null, duplicate, key.privateKey)))

  // Exercise real check/download/verify/IPC with only Electron and OS handoff replaced.
  const handlers = new Map()
  let tag = 'v1.7.4', payload = 'mac-x64.dmg', requests = 0, opened = 0, prepared = 0, autoDownload = false
  const urls = []
  const ipc = name => handlers.get(name)()
  const modules = {
    electron: {
      ipcMain: { handle: (name, cb) => handlers.set(name, cb) },
      app: { getVersion: () => '1.7.4', getPath: () => root, isPackaged: false },
      BrowserWindow: { getAllWindows: () => [] }, Notification: { isSupported: () => false },
      net: { fetch: async url => {
        urls.push(url)
        if (url.endsWith('/latest')) return Response.json({ tag_name: tag })
        if (url.endsWith('.json')) return new Response(raw)
        if (url.endsWith('.sig')) return new Response(signature)
        requests++
        return new Response(payload)
      } },
    },
    './store': { getSettings: () => ({ autoDownloadUpdates: autoDownload }) },
    './update-manifest': manifest,
    './update-platform': { installationFormat: async () => 'dmg', installPackage: async (_file, path) => {
      assert.equal(await readFile(path, 'utf8'), 'mac-x64.dmg')
      opened++
      return 'opened'
    } },
  }
  const exports = {}
  new Function('require', 'exports', 'process', '__UPDATE_EDITION__', '__UPDATE_PUBLIC_KEY__', source)(
    id => modules[id] ?? require(id), exports, { platform: 'darwin', arch: 'x64' }, edition, publicKey)
  exports.registerDesktopUpdates(() => { prepared++ }, () => {}, () => {}, () => {})
  await ipc('app:checkUpdate')
  assert.equal(ipc('update:state').phase, 'current')
  tag = 'v1.6.9'
  await ipc('app:checkUpdate')
  assert.equal(ipc('update:state').phase, 'current')
  tag = 'v1.7.5'
  await ipc('app:checkUpdate')
  assert.equal(ipc('update:state').phase, 'available')
  assert.equal(requests, 0)
  payload = 'bad'
  await ipc('update:download')
  assert.equal(ipc('update:state').phase, 'error')
  assert.equal(opened, 0)
  payload = 'mac-x64.dmg'
  autoDownload = true
  await Promise.all([ipc('app:checkUpdate'), ipc('app:checkUpdate')])
  assert.equal(ipc('update:state').phase, 'ready')
  assert.equal(requests, 2)
  const cached = join(root, 'desktop-updates', edition, edition + '-mac-x64.dmg')
  await writeFile(cached, 'mac-x64.bad')
  await ipc('update:install')
  assert.equal(ipc('update:state').phase, 'error')
  assert.equal(opened, 0)
  await ipc('app:checkUpdate')
  await Promise.all([ipc('update:install'), ipc('update:install')])
  assert.equal(opened, 1)
  assert.equal(prepared, 0)
  assert.ok(urls.every(url => url.includes(manifest.repositories[edition] + '/')))
  await rm(join(root, edition + '-desktop-linux', edition + '-linux-amd64.deb'))
  assert.throws(signRelease)
}

async function testInstallHandoff() {
  const platformSource = ts.transpileModule(await readFile(new URL('../src/main/update-platform.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const calls = []
  let refuseAuthorization = false
  const execFile = (command, args, options, callback) => {
    calls.push(options?.env?.CHEEZY_UPDATE_INSTALLER ?? [command, ...args])
    const done = callback ?? options
    done(refuseAuthorization ? new Error('Cancelled') : null, '')
  }
  const image = join(scratch, 'installed.AppImage')
  const env = { APPIMAGE: image }
  const modules = {
    electron: { app: { relaunch: () => calls.push('relaunch') }, shell: { showItemInFolder: () => calls.push('folder') } },
    'electron-updater': {},
    './update-manifest': manifest,
    'node:child_process': { execFile },
    'node:fs/promises': { ...require('node:fs/promises'), access: async () => {} },
  }
  const api = {}
  new Function('require', 'exports', 'process', platformSource)(id => modules[id] ?? require(id), api, { env })
  const downloaded = join(scratch, "Test user's update.deb")
  const bytes = Buffer.from('new app image')
  await writeFile(image, 'installed app image')
  await writeFile(downloaded, bytes)
  const asset = { format: 'AppImage', size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64') }
  const prepare = async () => { calls.push('prepare') }
  await assert.rejects(api.installPackage(asset, downloaded, async () => { throw Error('cleanup') }), /cleanup/)
  assert.equal(await readFile(image, 'utf8'), 'installed app image')
  assert.equal(await api.installPackage(asset, downloaded, prepare), 'quit')
  assert.deepEqual(await readFile(image), bytes)
  assert.deepEqual(calls.splice(0), ['prepare', 'relaunch'])
  asset.format = 'deb'
  await api.installPackage(asset, downloaded, prepare)
  assert.deepEqual(calls.splice(0), ['prepare', ['/usr/bin/pkexec', '--disable-internal-agent', '/usr/bin/apt-get', '--yes', '--no-remove', 'install', downloaded], 'relaunch'])
  refuseAuthorization = true
  await assert.rejects(api.installPackage(asset, downloaded, prepare), /Cancelled/)
  assert.ok(!calls.includes('relaunch'))
  calls.length = 0
  asset.format = 'nsis'
  await assert.rejects(api.installPackage(asset, downloaded, prepare), /Cancelled/)
  assert.deepEqual(calls.splice(0), ['prepare', downloaded])
  refuseAuthorization = false
  assert.equal(await api.installPackage(asset, downloaded, prepare), 'quit')
  assert.deepEqual(calls, ['prepare', downloaded])
}

try {
  await testInstallHandoff()
  await testEdition('CheezyClash')
  await testEdition('CheezyVPN')
  assert.equal(manifest.newer('1.10.0', '1.9.12'), true)
  assert.equal(manifest.newer('1.7.3', '1.7.4'), false)
  assert.throws(() => manifest.newer('1.8.0-beta', '1.7.4'))
  console.log('Both editions passed release signing, package selection, integrity, retry and explicit install checks.')
} finally { await rm(scratch, { recursive: true, force: true }) }
