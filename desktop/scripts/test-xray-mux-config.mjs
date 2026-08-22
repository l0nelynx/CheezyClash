import assert from 'node:assert/strict'

import { applyXrayMuxSettings } from '../src/main/xray-mux-config.ts'
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/shared/types.ts'

function settings(patch = {}) {
  return { ...DEFAULT_SETTINGS, ...patch, customRules: [] }
}

const defaultMux = {
  enabled: true,
  concurrency: 32,
  'max-connections': 3,
  'max-dials-per-minute': 3,
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
  applyXrayMuxSettings(doc, settings({ xrayMuxEnabled: true }))
  assert.deepEqual(doc.proxies[0]['xray-mux'], defaultMux)
  assert.deepEqual(doc.proxies[1]['xray-mux'], defaultMux)
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
  applyXrayMuxSettings(doc, settings({ xrayMuxEnabled: true }))
  assert.deepEqual(doc.proxies[0]['xray-mux'], defaultMux)
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
  applyXrayMuxSettings(
    unlimited,
    settings({
      xrayMuxEnabled: true,
      xrayMuxMaxConnections: 0,
      xrayMuxMaxDialsPerMinute: 0,
    }),
  )
  assert.equal('max-connections' in unlimited.proxies[0]['xray-mux'], false)
  assert.equal('max-dials-per-minute' in unlimited.proxies[0]['xray-mux'], false)
  assert.equal('max-worker-uses' in unlimited.proxies[0]['xray-mux'], false)

  const limited = { proxies: [{ name: 'node', type: 'vless' }] }
  applyXrayMuxSettings(
    limited,
    settings({
      xrayMuxEnabled: true,
      xrayMuxMaxConnections: 3,
      xrayMuxMaxDialsPerMinute: 3,
    }),
  )
  assert.equal(limited.proxies[0]['xray-mux']['max-connections'], 3)
  assert.equal(limited.proxies[0]['xray-mux']['max-dials-per-minute'], 3)
}

{
  const migrated = normalizeSettings({})
  assert.equal(migrated.xrayMuxEnabled, false)
  assert.equal(migrated.xrayMuxConcurrency, 32)
  assert.equal(migrated.xrayMuxMaxConnections, 3)
  assert.equal(migrated.xrayMuxMaxDialsPerMinute, 3)
  assert.equal(normalizeSettings({ xrayMuxConcurrency: 0 }).xrayMuxConcurrency, 32)
  assert.equal(normalizeSettings({ xrayMuxMaxConnections: -1 }).xrayMuxMaxConnections, 3)
  assert.equal(normalizeSettings({ xrayMuxMaxDialsPerMinute: -1 }).xrayMuxMaxDialsPerMinute, 3)
}

console.log('desktop Xray Mux config tests passed')
