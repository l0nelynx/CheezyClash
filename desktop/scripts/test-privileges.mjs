import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

const filename = new URL('../src/main/privileges.ts', import.meta.url)
const realRequire = createRequire(filename)
const js = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
function fixture({ uid = 501, owner = 501, mode = 0o755, helper = false } = {}) {
  const require = name => {
    if (name === 'os') return { platform: () => 'darwin' }
    if (name === 'fs') return { existsSync: () => true, statSync: () => ({ uid: owner, mode }) }
    if (name === './paths') return { coreBinaryPath: () => '/Applications/Test.app/core' }
    if (name === './helper') return { pingHelper: async () => helper, ensureHelper: async () => helper }
    if (name === './logger') return { log() {} }
    return realRequire(name)
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'process', js)(require, module, module.exports, { getuid: () => uid })
  return module.exports
}
assert.equal(await fixture().authorizeForTun(), false)
assert.equal(await fixture({ mode: 0o4755 }).privilegesOk(true), false, 'setuid to a normal user grants no root rights')
assert.equal(await fixture({ owner: 0, mode: 0o4755 }).authorizeForTun(), true)
assert.equal(await fixture({ uid: 0 }).authorizeForTun(), true)
assert.equal(await fixture({ helper: true }).authorizeForTun(), true)
assert.equal(await fixture().privilegesOk(false), true)
console.log('6 privilege scenarios passed (mocked macOS, no elevation)')
