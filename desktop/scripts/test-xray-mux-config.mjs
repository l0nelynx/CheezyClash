import assert from 'node:assert/strict'

import { applyXrayMuxSettings } from '../src/main/xray-mux-config.ts'
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/shared/types.ts'

function settings(patch = {}) {
  return { ...DEFAULT_SETTINGS, ...patch, accessControlRules: [] }
}

{
  const doc = {
    proxies: [
      { name: 'implicit-tcp', type: 'vless' },
      { name: 'explicit-tcp', type: 'vless', network: 'TCP' },
      { name: 'xhttp', type: 'vless', network: 'xhttp' },
      { name: 'grpc', type: 'vless', network: 'grpc' },
      { name: 'ws', type: 'vless', network: 'ws' },
      { name: 'hysteria', type: 'vless', network: 'hysteria' },
    ],
  }
  applyXrayMuxSettings(doc, settings())
  assert.deepEqual(doc.proxies[0]['xray-mux'], { enabled: true, concurrency: 32 })
  assert.deepEqual(doc.proxies[1]['xray-mux'], { enabled: true, concurrency: 32 })
  for (const proxy of doc.proxies.slice(2)) assert.equal(proxy['xray-mux'], undefined)
}

{
  const doc = {
    proxies: [
      { name: 'plain', type: 'vless', flow: ' ' },
      { name: 'vision', type: 'vless', flow: 'xtls-rprx-vision' },
      { name: 'other', type: 'vmess' },
    ],
  }
  applyXrayMuxSettings(doc, settings())
  assert.deepEqual(doc.proxies[0]['xray-mux'], { enabled: true, concurrency: 32 })
  assert.equal(doc.proxies[1]['xray-mux'], undefined)
  assert.equal(doc.proxies[2]['xray-mux'], undefined)
}

{
  const doc = {
    proxies: [{ name: 'node', type: 'vless', 'xray-mux': { enabled: true, concurrency: 99 } }],
    'proxy-providers': {
      remote: { type: 'http', override: { udp: true, 'xray-mux': { enabled: true } } },
    },
  }
  applyXrayMuxSettings(doc, settings({ xrayMuxEnabled: false }))
  assert.deepEqual(doc.proxies[0]['xray-mux'], { enabled: false })
  assert.deepEqual(doc['proxy-providers'].remote.override, {
    udp: true,
    'xray-mux': { enabled: false },
  })
}

{
  const unlimited = { proxies: [{ name: 'node', type: 'vless' }] }
  applyXrayMuxSettings(unlimited, settings({ xrayMuxMaxConnections: 0 }))
  assert.equal('max-connections' in unlimited.proxies[0]['xray-mux'], false)

  const limited = { proxies: [{ name: 'node', type: 'vless' }] }
  applyXrayMuxSettings(limited, settings({ xrayMuxMaxConnections: 3 }))
  assert.equal(limited.proxies[0]['xray-mux']['max-connections'], 3)
}

{
  const migrated = normalizeSettings({})
  assert.equal(migrated.xrayMuxEnabled, true)
  assert.equal(migrated.xrayMuxConcurrency, 32)
  assert.equal(migrated.xrayMuxMaxConnections, 0)
  assert.equal(normalizeSettings({ xrayMuxConcurrency: 0 }).xrayMuxConcurrency, 32)
  assert.equal(normalizeSettings({ xrayMuxMaxConnections: -1 }).xrayMuxMaxConnections, 0)
}

console.log('desktop Xray Mux config tests passed')
