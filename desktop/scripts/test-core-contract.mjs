import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const coreManager = readFileSync(new URL('../src/main/core-manager.ts', import.meta.url), 'utf8')
const profiles = readFileSync(new URL('../src/main/profiles.ts', import.meta.url), 'utf8')
const index = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
const api = readFileSync(new URL('../src/main/mihomo-api.ts', import.meta.url), 'utf8')

const initialApply = coreManager.slice(
  coreManager.indexOf('async function reconcileLifecycle'),
  coreManager.indexOf('export async function connect'),
)
assert.ok(initialApply.includes('spawnCoreDirect(configPath)'), 'cold start must spawn with -f')
assert.ok(!initialApply.includes('putConfigs('), 'cold start must not PUT /configs after -f')

const liveReload = coreManager.slice(coreManager.indexOf('setReloadActiveCoreHook'))
assert.ok(liveReload.includes('putConfigs(configPath)'), 'live reload must keep PUT /configs')
assert.ok(liveReload.includes('reason=live-reload'), 'live reload must be logged')

const activate = profiles.slice(
  profiles.indexOf('export function setActiveProfile'),
  profiles.indexOf('export function deleteProfile'),
)
assert.ok(!activate.includes('rebuildConfig('), 'profile activation must not rebuild implicitly')
assert.match(index, /await switchProfile\(id\)/)
assert.match(
  coreManager,
  /target\.rebuildWhenStopped[\s\S]*rebuildConfig\(target\.profileId\)/,
  'a stopped profile switch must rebuild through the lifecycle coordinator',
)

assert.ok(api.includes('groupsInFlight'), 'getGroups must be single-flight')
assert.match(api, /if \(this\.groupsInFlight\) return this\.groupsInFlight/)

assert.match(
  coreManager,
  /let effectiveMode = configuredMode\(profileId, target\.mode\)/,
  'launch mode must be resolved from the effective profile config',
)
assert.match(
  coreManager,
  /if \(!settings\.networkOverrideEnabled\) throw new Error\(lastError\)/,
  'YAML-managed TUN must not silently fall back to Proxy mode',
)
assert.match(
  coreManager,
  /settings\.networkOverrideEnabled[\s\S]*effectiveMode === 'proxy'[\s\S]*setManagedSystemProxy/,
  'system proxy must only be enabled while Desktop owns network settings',
)
assert.match(
  liveReload,
  /network\.mode !== mode[\s\S]*lifecycle\.request/,
  'a subscription mode change must restart through the lifecycle coordinator',
)
assert.match(
  index,
  /changesOverride \|\| changesMode[\s\S]*await connect\(/,
  'changing network ownership or mode must restart a running core',
)

console.log('desktop core lifecycle contract tests passed')
