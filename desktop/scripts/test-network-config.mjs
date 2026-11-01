import assert from 'node:assert/strict'

import { applyNetworkSettings as applyNetwork } from '../src/main/network-config.ts'
const applyNetworkSettings = (doc, settings) => applyNetwork(doc, settings, 'linux')
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/shared/types.ts'

function settings(patch = {}) {
  return { ...DEFAULT_SETTINGS, ...patch, customRules: [] }
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

// mips must survive both Desktop overrides and a profile-managed configuration.
for (const networkOverrideEnabled of [true, false]) {
  const saved = normalizeSettings({ networkOverrideEnabled, connectionMode: 'tun', tunStack: 'mips' })
  assert.equal(saved.tunStack, 'mips')
  const doc = networkOverrideEnabled ? {} : { tun: { enable: true, stack: 'mips' } }
  const effective = applyNetworkSettings(doc, saved)
  assert.equal(doc.tun.stack, 'mips')
  assert.equal(effective.tunStack, 'mips')
  assert.equal(effective.mode, 'tun')
}

{
  const migrated = normalizeSettings({ systemProxy: false })
  assert.equal(migrated.networkOverrideEnabled, false)
  assert.equal(migrated.tunMtu, 1500)
  assert.equal(migrated.autoStart, false)
  assert.equal(migrated.autoConnect, false)
  assert.equal(normalizeSettings({ autoStart: true, autoConnect: true }).autoStart, true)
  assert.equal(normalizeSettings({ autoStart: true, autoConnect: true }).autoConnect, true)
  assert.equal(normalizeSettings({ tunMtu: 575 }).tunMtu, 1500)
  assert.equal(normalizeSettings({ tunMtu: 9001 }).tunMtu, 1500)
  assert.equal(normalizeSettings({ tunMtu: 1400 }).tunMtu, 1400)
}

console.log('desktop network config tests passed')

for (const networkOverrideEnabled of [true, false]) {
  const doc = { tun: { enable: true } }
  applyNetwork(doc, settings({ networkOverrideEnabled, connectionMode: 'tun' }), 'darwin')
  assert.equal(doc.tun['dns-mode'], 'native', 'macOS must register DNS, including DHCP DNS on the LAN')
}
const explicit = { tun: { enable: true, 'dns-mode': 'disabled', device: 'utun42' } }
applyNetwork(explicit, settings(), 'darwin')
assert.equal(explicit.tun['dns-mode'], 'disabled', 'Preserve explicit provider DNS settings')
assert.throws(() => applyNetwork({ tun: { enable: true, device: 'Mihomo' } }, settings(), 'darwin'), /utun/)
const proxy = {}; applyNetwork(proxy, settings(), 'darwin')
assert.equal(proxy.tun['dns-mode'], undefined, 'Proxy must not change system DNS')
console.log('macOS network defaults and explicit profile settings passed')
