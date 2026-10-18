import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { runStartupTasks } from '../src/main/startup-tasks.ts'

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

await applyAutoStart(linuxApp, true, identity, linuxRuntime)
const desktopPath = linuxAutostartPath(tempHome, identity.appId, linuxRuntime.env)
const desktop = readFileSync(desktopPath, 'utf8')
assert.match(desktop, /^\[Desktop Entry\]/)
assert.match(desktop, /Exec="\/apps\/Cheezy%%Clash\.AppImage" --hidden/)
await applyAutoStart(linuxApp, false, identity, linuxRuntime)

let winState = false
const registrations = []
const windowsRunner = async request => { registrations.push(request);winState=request.enabled }
const winApp = {
  isPackaged: true,
  getPath: () => tempHome,
  setLoginItemSettings: ({ openAtLogin }) => { winState = openAtLogin },
  getLoginItemSettings: () => ({ openAtLogin: winState, executableWillLaunchAtLogin: winState }),
}
const winRuntime = { platform: 'win32', argv: [], execPath: 'C:\\CheezyClash.exe', env: {} }
await applyAutoStart(winApp, true, identity, winRuntime, windowsRunner)
assert.equal(winState, true)
await applyAutoStart(winApp, false, identity, winRuntime, windowsRunner)
assert.equal(winState, false)
assert.match(registrations[0].script, /resources[\\/]startup-task\.ps1$/)
assert.equal(registrations[0].executable, winRuntime.execPath)
assert.deepEqual(registrations[0].identity, identity)
// OS registration failure propagates to Settings; the persisted option is not changed.
await assert.rejects(applyAutoStart(winApp, true, identity, winRuntime, async () => {throw new Error('scheduler unavailable')}), /scheduler unavailable/)
// A rapid toggle cannot be overtaken by background startup reconciliation.
const gate = Promise.withResolvers()
let calls = 0
const queuedRunner = async request => {
  calls++
  if(calls === 1) await gate.promise
  winState = request.enabled
}
const enable = applyAutoStart(winApp, true, identity, winRuntime, queuedRunner)
const disable = applyAutoStart(winApp, false, identity, winRuntime, queuedRunner)
await new Promise(resolve => setImmediate(resolve))
assert.equal(calls,1)
gate.resolve()
await Promise.all([enable,disable])
assert.equal(winState,false)

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
await applyAutoStart(macApp, true, identity, macRuntime)
assert.equal(macState, true)
assert.equal(isSystemStartupLaunch(macApp, macRuntime), true)
await applyAutoStart(macApp, false, identity, macRuntime)
assert.equal(macState, false)

const devApp = { ...winApp, isPackaged: false }
await assert.rejects(applyAutoStart(devApp, true, identity, winRuntime), /installed app/)
await assert.rejects(
  applyAutoStart({ ...macApp, setLoginItemSettings: () => {}, getLoginItemSettings: () => ({ openAtLogin: false }) }, true, identity, macRuntime),
  /did not apply/,
)

function startupFixture(overrides = {}) {
  const events=[]
  return {events, tasks:{supportsAuth:true, autoConnectEnabled:()=>true, activeProfile:()=> 'saved',canAutoConnect:()=>true,
    connect:async()=>{events.push('connect');return {running:true}},syncSubscriptions:async()=>{events.push('sync')},mark:()=>{},warn:message=>events.push(message),...overrides}}
}
const syncGate=Promise.withResolvers()
const connectedGate=Promise.withResolvers()
const cached=startupFixture({connect:async()=>{cached.events.push('connect');await connectedGate.promise;return {running:true}},syncSubscriptions:async()=>{cached.events.push('sync');await syncGate.promise}})
const starting=runStartupTasks(cached.tasks)
assert.deepEqual(cached.events,['connect'],'cached profile connects without waiting for the network')
connectedGate.resolve()
await new Promise(resolve=>setImmediate(resolve))
assert.deepEqual(cached.events,['connect','sync'],'do not rewrite configs during startup of the saved profile')
syncGate.resolve();await starting
let profile=null
const fresh=startupFixture({activeProfile:()=>profile,syncSubscriptions:async()=>{fresh.events.push('sync');profile='new'}})
await runStartupTasks(fresh.tasks)
assert.deepEqual(fresh.events,['sync','connect'],'first launch obtains a missing profile before connecting')
let userActed=false
const manual=startupFixture({activeProfile:()=>profile,canAutoConnect:()=>!userActed,syncSubscriptions:async()=>{profile='new';userActed=true}})
profile=null
await runStartupTasks(manual.tasks)
assert.deepEqual(manual.events,[],'a user action during sync cancels deferred auto-connect')
const noAuto=startupFixture({autoConnectEnabled:()=>false})
await runStartupTasks(noAuto.tasks);assert.deepEqual(noAuto.events,['sync'])
const open=startupFixture({supportsAuth:false})
await runStartupTasks(open.tasks);assert.deepEqual(open.events,['connect'])
const failed=startupFixture({connect:async()=>{throw new Error('failed')}})
await runStartupTasks(failed.tasks)
assert.match(failed.events[0],/auto-connect failed/);assert.equal(failed.events[1],'sync')
const offline=startupFixture({syncSubscriptions:async()=>{throw new Error('offline')}})
await runStartupTasks(offline.tasks)
assert.equal(offline.events[0],'connect');assert.match(offline.events[1],/offline/)

if (process.platform === 'win32') {
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('test-startup-task.ps1',import.meta.url))],{encoding:'utf8',windowsHide:true,timeout:30000})
  assert.equal(result.status,0,result.stdout+result.stderr)
  console.log(result.stdout.trim())
}

rmSync(tempHome, { recursive: true, force: true })

console.log('desktop startup tests passed')
