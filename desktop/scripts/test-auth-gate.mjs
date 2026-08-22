import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const input = await readFile('src/renderer/src/lib/auth-gate.ts', 'utf8')
const built = ts.transpileModule(input, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
})
const moduleUrl = `data:text/javascript;base64,${Buffer.from(built.outputText).toString('base64')}`
const { shouldShowLogin } = await import(moduleUrl)

assert.equal(
  shouldShowLogin({ supportsAuth: false, hasSession: false, hasProfiles: false, loginRequested: false }),
  false,
)
assert.equal(
  shouldShowLogin({ supportsAuth: true, hasSession: false, hasProfiles: false, loginRequested: false }),
  true,
)
assert.equal(
  shouldShowLogin({ supportsAuth: true, hasSession: false, hasProfiles: true, loginRequested: false }),
  false,
)
assert.equal(
  shouldShowLogin({ supportsAuth: true, hasSession: false, hasProfiles: true, loginRequested: true }),
  true,
)
assert.equal(
  shouldShowLogin({ supportsAuth: true, hasSession: true, hasProfiles: false, loginRequested: true }),
  false,
)

console.log('auth gate tests passed')
