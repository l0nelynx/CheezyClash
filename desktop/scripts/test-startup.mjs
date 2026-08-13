import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  HIDDEN_LAUNCH_ARG,
  applyAutoStart,
  isSystemStartupLaunch,
  linuxAutostartPath,
  linuxDesktopEntry,
  linuxLaunchExecutable,
  quoteDesktopExecArg,
} from '../src/main/startup.ts'

const identity = { appId: 'com.cheezy.freedom.desktop', productName: 'CheezyClash' }
const tempHome = mkdtempSync(join(tmpdir(), 'cheezy-startup-'))
const linuxRuntime = {
  platform: 'linux',
  argv: [],
  execPath: '/usr/bin/cheezy clash',
  env: { XDG_CONFIG_HOME: join(tempHome, 'xdg'), APPIMAGE: '/apps/Cheezy%Clash.AppImage' },
}
const linuxApp = {
  isPackaged: true,
  getPath: () => tempHome,
  setLoginItemSettings: () => assert.fail('Electron login items are not used on Linux'),
  getLoginItemSettings: () => ({}),
}

assert.equal(quoteDesktopExecArg('C:\\Apps\\Cheezy "VPN".exe'), '"C:\\\\Apps\\\\Cheezy \\"VPN\\".exe"')
assert.equal(linuxLaunchExecutable(linuxRuntime), '/apps/Cheezy%Clash.AppImage')
assert.match(linuxDesktopEntry(identity, linuxLaunchExecutable(linuxRuntime)), /--hidden/)

applyAutoStart(linuxApp, true, identity, linuxRuntime)
const desktopPath = linuxAutostartPath(tempHome, identity.appId, linuxRuntime.env)
const desktop = readFileSync(desktopPath, 'utf8')
assert.match(desktop, /^\[Desktop Entry\]/)
assert.match(desktop, /Exec="\/apps\/Cheezy%%Clash\.AppImage" --hidden/)
applyAutoStart(linuxApp, false, identity, linuxRuntime)

let winState = false
const winApp = {
  isPackaged: true,
  getPath: () => tempHome,
  setLoginItemSettings: ({ openAtLogin }) => { winState = openAtLogin },
  getLoginItemSettings: () => ({ openAtLogin: winState, executableWillLaunchAtLogin: winState }),
}
const winRuntime = { platform: 'win32', argv: [], execPath: 'C:\\CheezyClash.exe', env: {} }
applyAutoStart(winApp, true, identity, winRuntime)
assert.equal(winState, true)
applyAutoStart(winApp, false, identity, winRuntime)
assert.equal(winState, false)

assert.equal(isSystemStartupLaunch(winApp, { ...winRuntime, argv: [HIDDEN_LAUNCH_ARG] }), true)
assert.equal(isSystemStartupLaunch(winApp, winRuntime), false)

let macState = false
const macApp = {
  isPackaged: true,
  getPath: () => tempHome,
  setLoginItemSettings: ({ openAtLogin }) => { macState = openAtLogin },
  getLoginItemSettings: () => ({ openAtLogin: macState, wasOpenedAtLogin: true }),
}
const macRuntime = { platform: 'darwin', argv: [], execPath: '/Applications/CheezyClash', env: {} }
applyAutoStart(macApp, true, identity, macRuntime)
assert.equal(macState, true)
assert.equal(isSystemStartupLaunch(macApp, macRuntime), true)
applyAutoStart(macApp, false, identity, macRuntime)
assert.equal(macState, false)

const devApp = { ...winApp, isPackaged: false }
assert.throws(() => applyAutoStart(devApp, true, identity, winRuntime), /installed app/)
assert.throws(
  () => applyAutoStart({ ...winApp, setLoginItemSettings: () => {}, getLoginItemSettings: () => ({ openAtLogin: false }) }, true, identity, winRuntime),
  /did not apply/,
)

rmSync(tempHome, { recursive: true, force: true })

console.log('desktop startup tests passed')
