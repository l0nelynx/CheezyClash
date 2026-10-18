import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { runStartupTasks } from '../src/main/startup-tasks.ts'
import { DEEP_LINK_IPC, parseDeepLink, deepLinkLogLabel } from '../src/shared/deep-link.ts'
import { PRIVATE_IPC } from '../src/shared/private-api.ts'

const source = ts.transpileModule(readFileSync(new URL('../src/main/index.ts',import.meta.url),'utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
}).outputText
const flush = async () => {for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve))}

function boot({hidden=true, recovery=false, supportsAuth=true}={}) {
  const ready = Promise.withResolvers(), recovered = Promise.withResolvers(), registration = Promise.withResolvers(), sync = Promise.withResolvers()
  const calls=[],windows=[],trays=[],handlers=new Map(),logs=[],statusListeners=[]
  let intent=false
  const status={running:false,mode:'proxy',controller:'127.0.0.1:9090',secret:'',helperReady:false,privilegesOk:true}
  const caps={supportsAuth,productName:'CheezyClash',deepLinkScheme:'cheezyclash'}
  const app = new EventEmitter()
  Object.assign(app,{requestSingleInstanceLock:()=>true,whenReady:()=>ready.promise,setName:()=>{},setAppUserModelId:()=>{},getAppPath:()=>'.',quit:()=>calls.push('quit'),isPackaged:false})
  app.defaultApp=true
  class Window extends EventEmitter {
    constructor() {super();this.shown=0;this.hidden=0;this.destroyed=false;this.webContents=new EventEmitter();this.webContents.send=(...args)=>calls.push(['send',...args]);windows.push(this)}
    loadFile() {calls.push('load-renderer')}
    loadURL() {calls.push('load-renderer')}
    show() {this.shown++}
    focus() {}
    moveTop() {}
    isMinimized() {return false}
    isDestroyed() {return this.destroyed}
    hide() {this.hidden++}
    static getAllWindows() {return windows.filter(window=>!window.destroyed)}
  }
  class Tray extends EventEmitter {
    constructor() {super();trays.push(this)}
    setToolTip() {}
    setContextMenu(menu) {this.menu=menu}
  }
  const modules={
    electron:{app,BrowserWindow:Window,Tray,Menu:{setApplicationMenu:()=>{},buildFromTemplate:items=>items},nativeImage:{createEmpty:()=>({})},ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},shell:{},dialog:{}},
    fs:{existsSync:()=>false,mkdirSync:()=>{}},
    './helper':{stopHelperOnExit:async()=>calls.push('stop-helper')},
    './core-manager':{
      corePresent:()=>true,restoreControllerAuth:()=>calls.push('restore-auth'),hasLifecycleRequest:()=>intent,
      getStatus:async()=>{if(recovery)await recovered.promise;return status},
      connect:async()=>{intent=true;calls.push('connect');const next={...status,running:true};for(const listener of statusListeners)listener(next);return next},
      disconnect:async()=>{intent=true;calls.push('disconnect');return status},
      syncManagedSystemProxy:async()=>calls.push('recover-proxy'),
      onCoreStatus:listener=>statusListeners.push(listener),
    },
    './mihomo-api':{},
    './profiles':{ensureProfilesRoot:()=>{},migrateOrphanDirs:()=>{},getActiveProfileId:()=> 'saved',importFromUrl:async()=>{calls.push('import');return {id:'imported'}}},
    './store':{getSettings:()=>({autoStart:true,autoConnect:true}),isSystemProxyOwned:()=>recovery},
    './processes':{},
    './logger':{log:message=>logs.push(message)},
    './paths':{coreHome:()=> 'C:\\unused-test-home'},
    '../shared/private-api':{PRIVATE_IPC},
    '../shared/deep-link':{DEEP_LINK_IPC,parseDeepLink,deepLinkLogLabel},
    '../shared/custom-rules':{},
    './private-module':{loadPrivateModule:()=>({capabilities:()=>caps}),getPrivateModule:()=>({capabilities:()=>caps})},
    './private-sync':{syncManagedFromPrivate:async()=>{calls.push('sync');return sync.promise}},
    './mihomo-label':{},
    './subscription-updater':{startSubscriptionUpdater:()=>calls.push('updater'),stopSubscriptionUpdater:()=>calls.push('stop-updater'),rescheduleSubscriptionUpdates:()=>{}},
    './profile-events':{notifyProfilesChanged:()=>{}},
    './startup':{applyAutoStart:()=>{calls.push('registration');return registration.promise},isSystemStartupLaunch:()=>hidden},
    './startup-tasks':{runStartupTasks},
  }
  const localRequire=name=>{if(Object.hasOwn(modules,name))return modules[name];if(name==='path')return {join:(...parts)=>parts.join('/'),basename:path=>path.split('/').at(-1)};throw new Error('Unexpected real dependency: '+name)}
  new Function('require','module','exports','process','__dirname',source)(localRequire,{exports:{}},{},{platform:'win32',argv:['CheezyClash.exe',...(hidden?['--hidden']:[])],env:{},defaultApp:true,uptime:()=>0.25},'C:/fixture/out/main')
  return {app,ready,recovered,registration,sync,calls,windows,trays,handlers,logs}
}

const hidden=boot()
hidden.ready.resolve();await flush()
assert.equal(hidden.windows.length,0,'hidden startup creates no BrowserWindow or renderer')
assert.equal(hidden.trays.length,1)
assert.ok(hidden.calls.includes('connect'),'pending task registration does not block auto-connect')
assert.ok(hidden.calls.indexOf('connect')<hidden.calls.indexOf('sync'))
assert.ok(hidden.trays[0].menu.some(item=>item.label==='Connected'),'core status updates tray without renderer polling')
hidden.app.emit('second-instance',{},['CheezyClash.exe','--hidden']);await flush()
assert.equal(hidden.windows.length,0,'a duplicate scheduled launch stays hidden')
hidden.app.emit('second-instance',{},['CheezyClash.exe']);await flush()
assert.equal(hidden.windows.length,1,'manual launch opens the existing tray client')
hidden.trays[0].emit('double-click');hidden.app.emit('activate')
assert.equal(hidden.windows.length,1,'repeated activation during loading reuses the same window')
assert.equal(hidden.windows[0].shown,0,'wait for first paint before showing')
hidden.windows[0].emit('ready-to-show');assert.equal(hidden.windows[0].shown,1)
let prevented=false
hidden.windows[0].emit('close',{preventDefault:()=>{prevented=true}})
assert.equal(prevented,true);assert.equal(hidden.windows[0].hidden,1)
hidden.windows[0].destroyed=true;hidden.windows[0].emit('closed')
hidden.trays[0].emit('double-click');assert.equal(hidden.windows.length,2,'recreate a destroyed window on demand')

const manual=boot({hidden:false})
manual.ready.resolve();await flush()
assert.equal(manual.windows.length,1,'normal startup creates the interface')

const link=boot({supportsAuth:false})
link.ready.resolve();await flush()
link.app.emit('open-url',{preventDefault:()=>{}},'cheezyclash://add/https%3A%2F%2Fexample.invalid%2Fsub')
await flush()
assert.equal(link.windows.length,1,'deep link wakes the windowless client')
assert.ok(link.calls.includes('import'))
assert.equal(link.handlers.get(DEEP_LINK_IPC.consumeResult)().status,'success','buffer results until the lazy renderer can consume them')
assert.equal(link.handlers.get(DEEP_LINK_IPC.consumeResult)(),null)

const duringRecovery=boot({recovery:true})
duringRecovery.ready.resolve();await flush()
assert.equal(duringRecovery.trays.length,0,'proxy recovery still precedes connect and IPC')
duringRecovery.app.emit('second-instance',{},['CheezyClash.exe'])
assert.equal(duringRecovery.windows.length,0)
duringRecovery.recovered.resolve();await flush()
assert.equal(duringRecovery.windows.length,1,'remember activation while startup recovery is pending')
assert.ok(duringRecovery.calls.indexOf('recover-proxy')<duringRecovery.calls.indexOf('connect'))

const exiting=boot({recovery:true})
exiting.ready.resolve();await flush()
exiting.app.emit('before-quit',{preventDefault:()=>{}})
await flush();exiting.recovered.resolve();await flush()
assert.equal(exiting.windows.length,0)
assert.equal(exiting.trays.length,0,'quit during recovery must not resurrect UI or startup tasks')
assert.equal(exiting.calls.includes('connect'),false)
assert.ok(exiting.calls.indexOf('disconnect')<exiting.calls.indexOf('stop-helper'))
assert.ok(exiting.calls.includes('quit'))

console.log('Main startup passed: windowless tray, cached connect, deferred registration, live tray status, manual/duplicate activation, deep links, recovery ordering and exit (OS boundaries mocked)')
