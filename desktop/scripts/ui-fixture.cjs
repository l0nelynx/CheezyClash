const { contextBridge, ipcRenderer } = require('electron')
const { snapshot } = require('./connections-fixture.cjs')
const preview = process.argv.includes('--connections-preview')
if (preview) {
  localStorage.setItem('cheezy-language', 'ru')
  localStorage.setItem('cheezy-theme', 'dark')
  if (!localStorage.getItem('cheezy-connections-grouping')) localStorage.setItem('cheezy-connections-grouping', 'process')
}
const listeners = new Map()
let failAuth = !preview
let running = true
let connectionState = 'live'
let connectionCalls = 0
let configUpdateAvailable = false
const settings = { systemProxy: true, mixedPort:7890, allowLan:false, tunEnabled:false, connectionMode:'proxy', tunStack:'mixed', networkOverrideEnabled:true, tunMtu:1500, autoStart:false, autoConnect:false, xrayMuxEnabled:false, xrayMuxConcurrency:32, xrayMuxMaxConnections:3, xrayMuxMaxDialsPerMinute:3, customRules:[] }
const status = () => ({running,configUpdateAvailable:running && configUpdateAvailable,mode:'proxy',controller:'127.0.0.1:9090',secret:'',helperReady:false,privilegesOk:false})
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
  connect: async () => { running=true;configUpdateAvailable=false;return status() }, disconnect: async () => {running=false;return status()},
  getSettings: async () => settings, setSettings: async patch => Object.assign(settings,patch),
  getTraffic: async () => ({up:128,down:1024,upTotal:10240,downTotal:102400}),
  getConnections: async () => {
    connectionCalls++
    if(connectionState === 'error') throw new Error('Controller unavailable')
    return connectionState === 'empty' ? {connections:[],sampledAt:Date.now()} : snapshot()
  },
  getGroups: async () => groups,
  selectProxy: async (group, name) => {groups.find(item=>item.name===group).now=name},
  listProfiles: async () => [profile], getActiveProfileId: async () => profile.id,
  getTunStatus: async () => ({enabled:false,helperInstalled:false,helperRunning:false,privilegesOk:false}),
  getLogs: async () => [...logs],
  privateCapabilities: async () => {if(failAuth)throw new Error('fixture failure');return {supportsAuth:false,productName:preview ? 'CheezyClash · демо Connections' : 'CheezyClash',deepLinkScheme:'cheezyclash'}},
  privateGetSession: async () => null, consumeDeepLinkResult: async () => null,
  windowIsMaximized: async () => false,
  importProfileUrl: async () => {throw new Error('Import failed for test')},
  getAppVersion: async () => 'test', getCoreVersion: async () => ({version:'test'}),
  getCustomRuleContext: async () => ({proxyGroups:['Main'],proxyNames:names,ruleSets:[],subRules:[],profiles:[{id:profile.id,name:profile.name,proxyGroups:['Main'],proxyNames:names,ruleSets:[],subRules:[],profileId:profile.id,resolvedProxyTarget:'Main'}],platform:'windows',activeProfileId:profile.id,profileId:profile.id,resolvedProxyTarget:'Main'}),
  listProcesses: async () => [{name:'Discord.exe',pid:100}],
  validateCustomRule: async rule => {if(!rule.payload.trim() && rule.type!=='MATCH')throw new Error('Value is required');return rule.type+','+rule.payload+','+rule.action},
  setCustomRules: async rules => {settings.customRules=rules;return settings},
  windowMinimize: async () => ipcRenderer.invoke('preview:minimize'),
  windowMaximizeToggle: async () => ipcRenderer.invoke('preview:maximize'),
  windowClose: async () => ipcRenderer.invoke('preview:close'),
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
  connectionState: value => {connectionState=value},
  connectionCalls: () => connectionCalls,
  profileConfigUpdate: value => {configUpdateAvailable=value;for(const listener of listeners.get('onProfilesChanged') ?? [])listener()},
  setRunning: value => {running=value;for(const listener of listeners.get('onStatus') ?? [])listener(status())},
  emitLog: line => {logs.push(line);for(const listener of listeners.get('onLog') ?? [])listener(line)},
})
