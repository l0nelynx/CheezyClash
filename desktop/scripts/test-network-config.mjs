import assert from 'node:assert/strict'

import { applyNetworkSettings } from '../src/main/network-config.ts'
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/shared/types.ts'

function settings(patch = {}) {
  return { ...DEFAULT_SETTINGS, ...patch, accessControlRules: [] }
}

{
  const doc = {
    'mixed-port': 9999,
    'allow-lan': false,
    'bind-address': '192.0.2.1',
    tun: { enable: false, stack: 'system', mtu: 8800, custom: 'discarded' },
  }
  const effective = applyNetworkSettings(
    doc,
    settings({
      networkOverrideEnabled: true,
      connectionMode: 'tun',
      tunEnabled: true,
      tunStack: 'gvisor',
      tunMtu: 1500,
      mixedPort: 7891,
      allowLan: true,
    }),
  )
  assert.equal(doc['mixed-port'], 7891)
  assert.equal(doc['allow-lan'], true)
  assert.equal(doc['bind-address'], '*')
  assert.deepEqual(doc.tun, {
    enable: true,
    stack: 'gvisor',
    mtu: 1500,
    'auto-route': true,
    'auto-detect-interface': true,
    'strict-route': true,
    'dns-hijack': ['any:53', 'tcp://any:53'],
  })
  assert.equal(effective.mode, 'tun')
}

{
  const doc = {
    'mixed-port': 0,
    'allow-lan': true,
    'bind-address': '',
    tun: {
      enable: true,
      stack: 'system',
      mtu: 1400,
      'auto-route': false,
      'dns-hijack': [],
      custom: 'preserved',
    },
  }
  const original = structuredClone(doc)
  const effective = applyNetworkSettings(doc, settings())
  assert.equal(doc['mixed-port'], original['mixed-port'])
  assert.equal(doc['allow-lan'], original['allow-lan'])
  assert.equal(doc['bind-address'], original['bind-address'])
  assert.equal(doc.tun.enable, true)
  assert.equal(doc.tun.stack, 'system')
  assert.equal(doc.tun.mtu, 1400)
  assert.equal(doc.tun['auto-route'], false)
  assert.deepEqual(doc.tun['dns-hijack'], [])
  assert.equal(doc.tun.custom, 'preserved')
  assert.equal(doc.tun['auto-detect-interface'], true)
  assert.equal(doc.tun['strict-route'], true)
  assert.equal(effective.mode, 'tun')
}

{
  const doc = {}
  const effective = applyNetworkSettings(doc, settings())
  assert.equal(doc['mixed-port'], 7890)
  assert.equal(doc['allow-lan'], false)
  assert.equal(doc['bind-address'], '127.0.0.1')
  assert.deepEqual(doc.tun, {
    enable: false,
    stack: 'mixed',
    mtu: 1500,
    'auto-route': true,
    'auto-detect-interface': true,
    'strict-route': true,
    'dns-hijack': ['any:53', 'tcp://any:53'],
  })
  assert.equal(effective.mode, 'proxy')
}

assert.throws(
  () => applyNetworkSettings({ tun: [] }, settings()),
  /tun must be a mapping/,
)
assert.doesNotThrow(() => applyNetworkSettings({ tun: null }, settings()))

{
  const migrated = normalizeSettings({ systemProxy: false })
  assert.equal(migrated.networkOverrideEnabled, false)
  assert.equal(migrated.tunMtu, 1500)
  assert.equal(normalizeSettings({ tunMtu: 575 }).tunMtu, 1500)
  assert.equal(normalizeSettings({ tunMtu: 9001 }).tunMtu, 1500)
  assert.equal(normalizeSettings({ tunMtu: 1400 }).tunMtu, 1400)
}

console.log('desktop network config tests passed')
