#!/usr/bin/env node
/**
 * Build host-platform mihomo from the go.mod-resolved mihomo module
 * (same replace/commit as Android libclash) into resources/core.
 * For local dev when the matching libclash-<hash> release asset is missing.
 */
import { mkdirSync, chmodSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { platform, arch } from 'os'
import { execFileSync } from 'child_process'
import { computeGoHash } from './go-hash.mjs'
import { readMihomoVersion } from './mihomo-version.mjs'
import { writeCoreManifest } from './core-manifest.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const goDir = join(root, '..', 'core', 'src', 'main', 'golang')
const outDir = join(root, 'resources', 'core')

function goos() {
  const p = platform()
  if (p === 'win32') return 'windows'
  if (p === 'darwin') return 'darwin'
  return 'linux'
}

function goarch() {
  const override = (process.env.TARGET_ARCH || process.env.npm_config_arch || '').toLowerCase()
  if (override === 'x64' || override === 'amd64') return 'amd64'
  if (override === 'arm64') return 'arm64'
  if (override === 'ia32' || override === '386') return '386'
  const a = arch()
  if (a === 'arm64') return 'arm64'
  if (a === 'ia32') return '386'
  return 'amd64'
}

mkdirSync(outDir, { recursive: true })
const binName = goos() === 'windows' ? 'mihomo.exe' : 'mihomo'
const outPath = join(outDir, binName)
const hash = computeGoHash(goDir)
const mihomoVer = readMihomoVersion(join(goDir, 'go.mod'))

console.log(`Building mihomo from root go.mod (hash ${hash}, ${mihomoVer}) for ${goos()}/${goarch()}…`)

// Bake Android-style pseudo-version into the binary (mihomo constant.Version).
const ldflags = `-s -w -X github.com/metacubex/mihomo/constant.Version=${mihomoVer}`

execFileSync(
  'go',
  [
    'build',
    '-tags',
    'with_gvisor',
    '-trimpath',
    `-ldflags=${ldflags}`,
    '-o',
    outPath,
    'github.com/metacubex/mihomo',
  ],
  {
    cwd: goDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      CGO_ENABLED: '0',
      GOOS: goos(),
      GOARCH: goarch(),
    },
  },
)

if (goos() !== 'windows') chmodSync(outPath, 0o755)
writeFileSync(join(outDir, 'mihomo-version.txt'), `${mihomoVer}\n`, 'utf8')
writeCoreManifest(
  { binaryPath: outPath, goDir, targetOs: goos(), targetArch: goarch() },
  join(outDir, 'core-build.json'),
)
console.log('Wrote', outPath)
console.log('Wrote', join(outDir, 'core-build.json'))
console.log('mihomo-version.txt =', mihomoVer)
