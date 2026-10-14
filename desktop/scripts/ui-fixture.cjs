const { contextBridge } = require('electron')
const listeners = new Map()
let failAuth = true
let running = true
const settings = { systemProxy: true, mixedPort:7890, allowLan:false, tunEnabled:false, connectionMode:'proxy', tunStack:'mixed', networkOverrideEnabled:true, tunMtu:1500, autoStart:false, autoConnect:false, xrayMuxEnabled:false, xrayMuxConcurrency:32, xrayMuxMaxConnections:3, xrayMuxMaxDialsPerMinute:3, customRules:[] }
const status = () => ({running,mode:'proxy',controller:'127.0.0.1:9090',secret:'',helperReady:false,privilegesOk:false})
const profile = { id:'fixture', name:'Test subscription', url:'https://example.invalid/private/SECRET_TOKEN', createdAt:1, updatedAt:Date.now(), subscription:{title:'Test subscription', upload:1024,download:2048,total:1000000,expire:0} }
const names = Array.from({length:1000},(_,i)=>`Server ${String(i).padStart(4,'0')}`)
const members = Object.fromEntries(names.map((name, index) => [name, {type:index % 2 ? 'trojan' : 'vless',network:index % 2 ? 'tcp' : 'ws',serverDescription:`Location ${index} · streaming and browsing`}]))
const groups = [
  {name:'Main',type:'Selector',now:names[0],all:names,members,delays:Object.fromEntries(names.map((n,i)=>[n,1000-i]))},
  {name:'Media',type:'Selector',now:names[2],all:names.slice(0,12),members,delays:{}},
  {name:'Auto',type:'URLTest',now:names[3],all:names.slice(0,6),members,delays:{}},
  ...Array.from({length:9},(_,index)=>({name:`Group ${index+4}`,type:'Selector',now:names[index],all:names.slice(0,6),members,delays:{}})),
]
const logs = Array.from({length:400},(_,i)=>`[${i}] [info] test log ${i}`)
const api = {
  getStatus: async () => status(),
  connect: async () => { running=true; return status() }, disconnect: async () => {running=false;return status()},
  getSettings: async () => settings, setSettings: async patch => Object.assign(settings,patch),
  getTraffic: async () => ({up:128,down:1024,upTotal:10240,downTotal:102400}),
  getGroups: async () => groups,
  selectProxy: async (group, name) => {groups.find(item=>item.name===group).now=name},
  listProfiles: async () => [profile], getActiveProfileId: async () => profile.id,
  getTunStatus: async () => ({enabled:false,helperInstalled:false,helperRunning:false,privilegesOk:false}),
  getLogs: async () => [...logs],
  privateCapabilities: async () => {if(failAuth)throw new Error('fixture failure');return {supportsAuth:false,productName:'CheezyClash',deepLinkScheme:'cheezyclash'}},
  privateGetSession: async () => null, consumeDeepLinkResult: async () => null,
  windowIsMaximized: async () => false,
  importProfileUrl: async () => {throw new Error('Import failed for test')},
  getAppVersion: async () => 'test', getCoreVersion: async () => ({version:'test'}),
  getCustomRuleContext: async () => ({proxyGroups:['Main'],proxyNames:names,ruleSets:[],subRules:[],profiles:[{id:profile.id,name:profile.name,proxyGroups:['Main'],proxyNames:names,ruleSets:[],subRules:[],profileId:profile.id,resolvedProxyTarget:'Main'}],platform:'windows',activeProfileId:profile.id,profileId:profile.id,resolvedProxyTarget:'Main'}),
  listProcesses: async () => [{name:'Discord.exe',pid:100}],
  validateCustomRule: async rule => {if(!rule.payload.trim() && rule.type!=='MATCH')throw new Error('Value is required');return rule.type+','+rule.payload+','+rule.action},
  setCustomRules: async rules => {settings.customRules=rules;return settings},
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
