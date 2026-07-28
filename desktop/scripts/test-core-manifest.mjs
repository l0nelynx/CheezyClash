#!/usr/bin/env node
import assert from 'node:assert/strict'
import {
  appendFileSync,
  copyFileSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateCoreArtifact } from './core-manifest.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopDir = join(scriptDir, '..')
const goDir = join(desktopDir, '..', 'core', 'src', 'main', 'golang')
const targetOs = process.platform === 'win32' ? 'windows' : process.platform
const override = (process.env.TARGET_ARCH || process.env.npm_config_arch || '').toLowerCase()
const targetArch =
  override === 'arm64'
    ? 'arm64'
    : override === 'ia32' || override === '386'
      ? '386'
      : override === 'x64' || override === 'amd64'
        ? 'amd64'
        : process.arch === 'arm64'
          ? 'arm64'
          : process.arch === 'ia32'
            ? '386'
            : 'amd64'
const binaryName = targetOs === 'windows' ? 'mihomo.exe' : 'mihomo'
const sourceDir = join(desktopDir, 'resources', 'core')
const sourceBinary = join(sourceDir, binaryName)

const packageJson = JSON.parse(readFileSync(join(desktopDir, 'package.json'), 'utf8'))
for (const command of ['package', 'dist', 'dist:win', 'dist:linux', 'dist:mac']) {
  assert.match(
    packageJson.scripts[command],
    /^npm run fetch-core && /,
    `${command} must verify/fetch core before packaging`,
  )
}
const gradle = readFileSync(join(desktopDir, 'build.gradle.kts'), 'utf8')
assert.match(gradle, /packageUnpacked[\s\S]*dependsOn\("npmInstall", "fetchCore"\)/)
assert.match(gradle, /distInstaller[\s\S]*dependsOn\("npmInstall", "fetchCore"\)/)

const valid = validateCoreArtifact({
  dir: sourceDir,
  binaryPath: sourceBinary,
  goDir,
  targetOs,
  targetArch,
})
assert.equal(valid.valid, true, valid.errors?.join('\n'))

const tempDir = mkdtempSync(join(tmpdir(), 'cheezy-core-manifest-'))
try {
  cpSync(sourceDir, tempDir, { recursive: true })
  const tempBinary = join(tempDir, binaryName)
  appendFileSync(tempBinary, Buffer.from([0]))
  const tampered = validateCoreArtifact({
    dir: tempDir,
    binaryPath: tempBinary,
    goDir,
    targetOs,
    targetArch,
  })
  assert.equal(tampered.valid, false)
  assert.ok(tampered.errors.some((error) => error.includes('SHA-256')))

  copyFileSync(sourceBinary, tempBinary)
  const manifestPath = join(tempDir, 'core-build.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.goSourceHash = 'stale-source'
  writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8')
  const stale = validateCoreArtifact({
    dir: tempDir,
    binaryPath: tempBinary,
    goDir,
    targetOs,
    targetArch,
  })
  assert.equal(stale.valid, false)
  assert.ok(stale.errors.some((error) => error.includes('Go source hash')))
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log(`core manifest tests passed for ${basename(sourceBinary)}`)
