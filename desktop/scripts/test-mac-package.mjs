import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { validateConfiguration } from 'app-builder-lib/internal'
import afterPack from './after-pack.mjs'

// Validate against the installed builder, so a signing-schema migration cannot
// silently turn the no-Developer-ID release into a certificate-dependent build.
const config = yaml.load(await readFile(new URL('../electron-builder.yml', import.meta.url), 'utf8'))
await validateConfiguration(config, { isEnabled: false })
assert.equal(config.mac.notarize, false)
assert.equal(config.mac.sign.identity, '-')
assert.equal(config.mac.sign.hardenedRuntime, false)
for (const file of ['core/mihomo', 'helper/cheezy-helper']) {
  assert.ok(config.mac.sign.binaries.includes(`Contents/Resources/${file}`))
}

const root = await mkdtemp(join(tmpdir(), 'cheezy-mac-package-'))
const resources = join(root, 'CheezyClash.app', 'Contents', 'Resources')
const context = { electronPlatformName: 'darwin', appOutDir: root,
  packager: { appInfo: { productFilename: 'CheezyClash' } } }
try {
  await mkdir(join(resources, 'core'), { recursive: true })
  await mkdir(join(resources, 'helper'), { recursive: true })
  await assert.rejects(afterPack(context), /missing core\/mihomo/)
  await writeFile(join(resources, 'core/mihomo'), Buffer.from('cffaedfe', 'hex'))
  await assert.rejects(afterPack(context), /missing helper\/cheezy-helper/)
  await writeFile(join(resources, 'helper/cheezy-helper'), 'Windows executable')
  await assert.rejects(afterPack(context), /non-Mach-O helper\/cheezy-helper/)
  await writeFile(join(resources, 'helper/cheezy-helper'), Buffer.from('cffaedfe', 'hex'))
  await afterPack(context)
  console.log('macOS packaging: builder schema, ad-hoc signing and required native binaries passed')
} finally {
  await rm(root, { recursive: true, force: true })
}
