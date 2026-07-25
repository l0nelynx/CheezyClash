import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const input = await readFile('src/shared/deep-link.ts', 'utf8')
const profilesSource = await readFile('src/main/profiles.ts', 'utf8')
const mainSource = await readFile('src/main/index.ts', 'utf8')
const built = ts.transpileModule(input, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
})
const source = built.outputText
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const { deepLinkLogLabel, parseDeepLink } = await import(moduleUrl)

const open = {
  supportsAuth: false,
  productName: 'CheezyClash',
  deepLinkScheme: 'cheezyclash',
}
const proprietary = {
  supportsAuth: true,
  productName: 'CheezyVPN',
  deepLinkScheme: 'cheezyvpn',
  legacyDeepLinkSchemes: ['cheezy'],
}

assert.deepEqual(
  parseDeepLink('cheezyclash://add/https%3A%2F%2Fexample.com%2Fsub', open),
  { kind: 'add', subscriptionUrl: 'https://example.com/sub' },
)
assert.equal(parseDeepLink('cheezy://add/https://example.com/sub', open), null)
assert.equal(parseDeepLink('cheezyvpn://login/valid_token-12345', open), null)
assert.deepEqual(
  parseDeepLink('cheezyvpn://login/valid_token-12345', proprietary),
  { kind: 'login', token: 'valid_token-12345' },
)
assert.deepEqual(
  parseDeepLink('cheezy://login/legacy_token-12345', proprietary),
  { kind: 'login', token: 'legacy_token-12345' },
)
assert.equal(parseDeepLink('cheezyvpn://add/http://example.com/sub', proprietary), null)
assert.equal(deepLinkLogLabel({ kind: 'login', token: 'must-not-appear' }), 'deeplink login')
assert.equal(/log\(`[^`]*\$\{url\}/.test(profilesSource), false)
assert.match(mainSource, /function revealMainWindow[\s\S]*isMinimized\(\)[\s\S]*restore\(\)/)
assert.match(mainSource, /exchangeAppLogin[\s\S]*revealMainWindow\(\)[\s\S]*publishDeepLinkResult/)

console.log('deep-link tests passed')
