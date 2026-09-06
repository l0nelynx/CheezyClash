const { contextBridge } = require('electron')
const listeners = new Map()
let failAuth = true
let running = true
const settings = { systemProxy: true, mixedPort:7890, allowLan:false, tunEnabled:false, connectionMode:'proxy', tunStack:'mixed', networkOverrideEnabled:true, tunMtu:1500, autoStart:false, autoConnect:false, xrayMuxEnabled:false, xrayMuxConcurrency:32, xrayMuxMaxConnections:3, xrayMuxMaxDialsPerMinute:3, customRules:[] }
const status = () => ({running,mode:'proxy',controller:'127.0.0.1:9090',secret:'',helperReady:false,privilegesOk:false})
const profile = { id:'fixture', name:'Test subscription', url:'https://example.invalid/private/SECRET_TOKEN', createdAt:1, updatedAt:Date.now(), subscription:{title:'Test subscription', upload:1024,download:2048,total:1000000,expire:0} }
const names = Array.from({length:1000},(_,i)=>`Server ${String(i).padStart(4,'0')}`)
const logs = Array.from({length:400},(_,i)=>`[${i}] [info] test log ${i}`)
const api = {
  getStatus: async () => status(),
  connect: async () => { running=true; return status() }, disconnect: async () => {running=false;return status()},
  getSettings: async () => settings, setSettings: async patch => Object.assign(settings,patch),
  getTraffic: async () => ({up:128,down:1024,upTotal:10240,downTotal:102400}),
  getGroups: async () => [{name:'Main',type:'Selector',now:names[0],all:names,delays:Object.fromEntries(names.map((n,i)=>[n,1000-i]))}],
  listProfiles: async () => [profile], getActiveProfileId: async () => profile.id,
  getTunStatus: async () => ({enabled:false,helperInstalled:false,helperRunning:false,privilegesOk:false}),
  getLogs: async () => [...logs],
  privateCapabilities: async () => {if(failAuth)throw new Error('fixture failure');return {supportsAuth:false,productName:'CheezyClash',deepLinkScheme:'cheezyclash'}},
  privateGetSession: async () => null, consumeDeepLinkResult: async () => null,
  windowIsMaximized: async () => false,
  importProfileUrl: async () => {throw new Error('Import failed for test')},
  getAppVersion: async () => 'test', getCoreVersion: async () => ({version:'test'}),
  getCustomRuleContext: async () => ({proxyGroups:['Main'],proxyNames:names,ruleSets:[],subRules:[],profiles:[],platform:'windows',activeProfileId:'fixture'}),
}
for(const name of ['onLog','onStatus','onProfilesChanged','onCustomRuleDiagnostics','onDeepLinkResult','onWindowMaximized']) {
  api[name] = callback => {
    const set = listeners.get(name) ?? new Set();listeners.set(name,set);set.add(callback)
    return () => set.delete(callback)
  }
}
contextBridge.exposeInMainWorld('cheezy',api)
contextBridge.exposeInMainWorld('qa',{
  allowAuth: () => {failAuth=false},
  emitLog: line => {logs.push(line);for(const listener of listeners.get('onLog') ?? [])listener(line)},
})
