import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { PublicIpMonitor, PUBLIC_IP_COOLDOWN_MS, PUBLIC_IP_PROVIDERS, parsePublicIp } from '../src/main/public-ip-monitor.ts'
import { publicIpProxy } from '../src/main/public-ip-proxy.ts'

const flush = async () => { for (let i=0;i<6;i++) await new Promise(resolve=>setImmediate(resolve)) }
const json = (value, init) => new Response(JSON.stringify(value), init)
for (const input of [
  {ip:'203.0.113.42',location:{country_code:'de'}},
  {ip:'203.0.113.42',country:'DE'},
  {ip:'203.0.113.42',country_code:'DE'},
  {ip:'203.0.113.42',cc:'DE'},
  {query:'203.0.113.42',countryCode:'DE',status:'success'},
]) assert.deepEqual(parsePublicIp(input),{ip:'203.0.113.42',countryCode:'DE'})
assert.deepEqual(parsePublicIp({ip:'2001:db8::1',country:'unknown'}),{ip:'2001:db8::1',countryCode:undefined})
for (const input of [null, {}, {ip:'bad'}, {ip:'1.2.3.4',error:true}, {query:'1.2.3.4',status:'fail'}]) assert.throws(()=>parsePublicIp(input))

let now=0, calls=[]
let response=()=>Promise.resolve(json({ip:'203.0.113.42',country:'DE'}))
const monitor=new PublicIpMonitor((url,signal)=>{calls.push({url,signal});return response()},()=>now)
assert.equal(monitor.snapshot().state,'disconnected')
assert.equal(calls.length,0)
monitor.setRoute('A')
assert.equal(monitor.snapshot().state,'pending')
monitor.snapshot();monitor.snapshot()
assert.equal(calls.length,1,'concurrent reads share one external request')
await flush()
assert.equal(monitor.snapshot().ip,'203.0.113.42')
for(let i=0;i<20;i++) {now+=100;monitor.setRoute('node-'+i);assert.equal(monitor.snapshot().ip,undefined)}
monitor.setRoute(null);assert.equal(monitor.snapshot().state,'disconnected')
monitor.setRoute('A');monitor.snapshot()
assert.equal(calls.length,1,'reconnecting or returning to the old route cannot reset cooldown/cache')
now=PUBLIC_IP_COOLDOWN_MS-1;monitor.snapshot();assert.equal(calls.length,1)
now++;monitor.snapshot();await flush();assert.equal(calls.length,2)
now+=PUBLIC_IP_COOLDOWN_MS
const old=Promise.withResolvers()
response=()=>old.promise
monitor.setRoute('old');monitor.snapshot()
monitor.setRoute('new')
assert.equal(calls.at(-1).signal.aborted,true)
old.resolve(json({ip:'192.0.2.9',country:'FR'}));await flush()
assert.equal(monitor.snapshot().ip,undefined,'late results from aborted routes must not become visible')
assert.equal(calls.length,3)

now+=PUBLIC_IP_COOLDOWN_MS
response=()=>Promise.resolve(json({}, {status:429,headers:{'Retry-After':'180'}}))
monitor.snapshot();await flush()
assert.equal(monitor.snapshot().retryAt,now+180_000)
now+=60_000;monitor.setRoute('another');monitor.snapshot();assert.equal(calls.length,4,'provider backoff survives route changes')
now+=120_000
response=()=>Promise.resolve(json({ip:'2001:db8::8',country:'NL'}))
monitor.snapshot();await flush()
assert.equal(calls.at(-1).url,PUBLIC_IP_PROVIDERS[1].url,'failed provider rotates only after cooldown')
assert.equal(monitor.snapshot().countryCode,'NL')
now+=60_000;monitor.setRoute('ttl')
response=()=>Promise.resolve(json({ip:'1.2.3.4'}, {headers:{'X-Rl':'0','X-Ttl':'120'}}))
monitor.snapshot();await flush();monitor.setRoute('next')
assert.equal(monitor.snapshot().retryAt,now+120_000)
monitor.setRoute(null)

// Exercise actual Electron adapter with local boundaries replaced; no network/core changes.
const source=ts.transpileModule(readFileSync(new URL('../src/main/public-ip.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
let status={running:true,connectedAt:1,mode:'proxy'}
let groups=[{name:'Main',now:'A'}]
let config={'mixed-port':17890}
let options, seenProxy, operations=[], externalCalls=0
const modules={
  electron:{session:{fromPartition:(name,opts)=>{assert.equal(name,'public-ip');assert.equal(opts.cache,false);return {
    closeAllConnections:async()=>operations.push('close'),setProxy:async value=>{seenProxy=value;operations.push('proxy')},
    fetch:async(url,opts)=>{externalCalls++;options=opts;operations.push('fetch');return json({ip:'203.0.113.5',country:'US'})},
  }}}},
  './core-manager':{getStatus:async()=>status},
  './mihomo-api':{mihomoApi:{getProxies:async()=>Object.fromEntries(groups.map(group=>[group.name,{now:group.now}])),request:async()=>config}},
  './public-ip-monitor':{PublicIpMonitor},
  './public-ip-proxy':{publicIpProxy},
}
const module={exports:{}}
new Function('require','module','exports',source)(name=>{assert.ok(modules[name],name);return modules[name]},module,module.exports)
const api=module.exports
assert.equal((await api.getPublicIp()).state,'pending');await flush()
assert.equal((await api.getPublicIp()).ip,'203.0.113.5')
assert.deepEqual(operations,['close','proxy','fetch'])
assert.equal(seenProxy.proxyRules,'http://127.0.0.1:17890')
assert.equal(options.cache,'no-store');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error')
groups=[{name:'Main',now:'B'}];api.observePublicIpGroups(groups)
assert.equal((await api.getPublicIp()).ip,undefined,'automatic group updates clear cached IP')
const end=api.beginPublicIpSelection();assert.equal((await api.getPublicIp()).ip,undefined);end()
assert.equal((await api.getPublicIp()).ip,undefined)
assert.equal(externalCalls,1)
groups=[{name:'Main',now:'Auto'},{name:'Auto',now:'B'}]
api.observePublicIpGroups(groups)
assert.equal((await api.getPublicIp()).ip,undefined)
status={...status,running:false};api.observePublicIpStatus(status)
assert.equal((await api.getPublicIp()).state,'disconnected')
assert.equal(api.publicIpProxy({port:7891}).proxyRules,'http://127.0.0.1:7891')
assert.equal(api.publicIpProxy({'socks-port':7892}).proxyRules,'socks5://127.0.0.1:7892')
assert.deepEqual(api.publicIpProxy({tun:{enable:true}}),{mode:'direct'})
assert.throws(()=>api.publicIpProxy({'mixed-port':0}))
console.log('Public IP passed: provider formats, IPv6, cooldown, reconnect storms, stale replies, rate-limit backoff, fallback, proxy routing and IPC adapter.')
