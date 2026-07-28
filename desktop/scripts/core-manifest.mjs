import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { computeGoHash } from './go-hash.mjs'
import { readMihomoVersion } from './mihomo-version.mjs'
import {
  moduleGraphHash,
  moduleIdentity,
  readGoBuildInfo,
} from './core-build-info.mjs'

export const CORE_MANIFEST_SCHEMA_VERSION = 1
export const DESKTOP_BUILD_TAGS = ['with_gvisor']
export const DESKTOP_CGO_ENABLED = false
export const CORE_MANIFEST_NAME = 'core-build.json'

const MANDATORY_MODULES = [
  'github.com/metacubex/mihomo',
  'github.com/metacubex/utls',
  'google.golang.org/protobuf',
]

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function expectedModules(goDir) {
  const format = '{{.Path}}\t{{.Version}}\t{{with .Replace}}{{.Path}}\t{{.Version}}{{end}}'
  const text = execFileSync('go', ['list', '-m', '-f', format, 'all'], {
    cwd: goDir,
    encoding: 'utf8',
  })
  const modules = new Map()
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const [path, version = '', replacementPath = '', replacementVersion = ''] = line.split('\t')
    modules.set(path, {
      path,
      version,
      replacement: replacementPath
        ? { path: replacementPath, version: replacementVersion }
        : null,
    })
  }
  return modules
}

function normalizeTags(value) {
  if (typeof value !== 'string' || !value) return []
  return value.split(',').filter(Boolean).sort()
}

export function inspectCoreBuild(binaryPath, goDir, targetOs, targetArch) {
  const info = readGoBuildInfo(binaryPath)
  const expected = expectedModules(goDir)
  const errors = []

  if (info.settings.GOOS !== targetOs) {
    errors.push(`GOOS ${info.settings.GOOS || '(missing)'} != ${targetOs}`)
  }
  if (info.settings.GOARCH !== targetArch) {
    errors.push(`GOARCH ${info.settings.GOARCH || '(missing)'} != ${targetArch}`)
  }
  if (info.settings.CGO_ENABLED !== '0') {
    errors.push(`CGO_ENABLED ${info.settings.CGO_ENABLED || '(missing)'} != 0`)
  }
  const actualTags = normalizeTags(info.settings['-tags'])
  if (JSON.stringify(actualTags) !== JSON.stringify([...DESKTOP_BUILD_TAGS].sort())) {
    errors.push(`build tags ${actualTags.join(',') || '(missing)'} != ${DESKTOP_BUILD_TAGS.join(',')}`)
  }

  for (const name of MANDATORY_MODULES) {
    if (!info.modules.has(name)) errors.push(`missing mandatory module ${name}`)
  }
  for (const [name, builtModule] of info.modules) {
    const expectedModule = expected.get(name)
    if (!expectedModule) {
      errors.push(`module ${name} is absent from root go.mod graph`)
      continue
    }
    if (moduleIdentity(builtModule) !== moduleIdentity(expectedModule)) {
      errors.push(
        `${name} build-info=${moduleIdentity(builtModule)} root=${moduleIdentity(expectedModule)}`,
      )
    }
  }

  return { info, errors }
}

export function createCoreManifest({ binaryPath, goDir, targetOs, targetArch }) {
  const { info, errors } = inspectCoreBuild(binaryPath, goDir, targetOs, targetArch)
  if (errors.length) throw new Error(`refusing to certify core:\n- ${errors.join('\n- ')}`)
  return {
    schemaVersion: CORE_MANIFEST_SCHEMA_VERSION,
    goSourceHash: computeGoHash(goDir),
    targetOs,
    targetArch,
    binaryName: basename(binaryPath),
    binarySha256: sha256File(binaryPath),
    mihomoVersion: readMihomoVersion(join(goDir, 'go.mod')),
    goVersion: info.goVersion,
    buildTags: DESKTOP_BUILD_TAGS,
    cgoEnabled: DESKTOP_CGO_ENABLED,
    moduleGraphHash: moduleGraphHash(info),
  }
}

export function writeCoreManifest(options, manifestPath) {
  const manifest = createCoreManifest(options)
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return manifest
}

export function validateCoreArtifact({ dir, binaryPath, goDir, targetOs, targetArch }) {
  const manifestPath = join(dir, CORE_MANIFEST_NAME)
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    return { valid: false, errors: [`missing or unreadable ${CORE_MANIFEST_NAME}: ${error.message}`] }
  }

  const errors = []
  if (manifest.schemaVersion !== CORE_MANIFEST_SCHEMA_VERSION) {
    errors.push(`schemaVersion ${manifest.schemaVersion} != ${CORE_MANIFEST_SCHEMA_VERSION}`)
  }
  const sourceHash = computeGoHash(goDir)
  if (manifest.goSourceHash !== sourceHash) {
    errors.push(`Go source hash ${manifest.goSourceHash || '(missing)'} != ${sourceHash}`)
  }
  if (manifest.targetOs !== targetOs || manifest.targetArch !== targetArch) {
    errors.push(
      `target ${manifest.targetOs || '?'}/${manifest.targetArch || '?'} != ${targetOs}/${targetArch}`,
    )
  }
  if (manifest.binaryName !== basename(binaryPath)) {
    errors.push(`binary name ${manifest.binaryName || '(missing)'} != ${basename(binaryPath)}`)
  }
  try {
    const binaryHash = sha256File(binaryPath)
    if (manifest.binarySha256 !== binaryHash) errors.push('binary SHA-256 does not match manifest')
    const { info, errors: buildErrors } = inspectCoreBuild(binaryPath, goDir, targetOs, targetArch)
    errors.push(...buildErrors)
    if (manifest.moduleGraphHash !== moduleGraphHash(info)) {
      errors.push('module graph hash does not match build-info')
    }
    const expectedVersion = readMihomoVersion(join(goDir, 'go.mod'))
    if (manifest.mihomoVersion !== expectedVersion) {
      errors.push(`mihomo version ${manifest.mihomoVersion || '(missing)'} != ${expectedVersion}`)
    }
    if (manifest.goVersion !== info.goVersion) errors.push('Go version does not match build-info')
  } catch (error) {
    errors.push(`cannot inspect binary: ${error.message}`)
  }
  if (JSON.stringify(manifest.buildTags) !== JSON.stringify(DESKTOP_BUILD_TAGS)) {
    errors.push('manifest build tags are invalid')
  }
  if (manifest.cgoEnabled !== DESKTOP_CGO_ENABLED) {
    errors.push('manifest CGO mode is invalid')
  }
  return { valid: errors.length === 0, errors, manifest }
}
