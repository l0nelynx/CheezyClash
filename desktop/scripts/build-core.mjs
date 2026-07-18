#!/usr/bin/env node
/**
 * Build host-platform mihomo from core/src/main/golang (same go.mod / replace
 * as Android libclash) into resources/core. For local dev when the matching
 * libclash-<hash> release asset is not published yet.
 */
import { mkdirSync, chmodSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { platform, arch } from 'os'
import { execFileSync } from 'child_process'
import { computeGoHash } from './go-hash.mjs'

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
  const a = arch()
  if (a === 'arm64') return 'arm64'
  if (a === 'ia32') return '386'
  return 'amd64'
}

mkdirSync(outDir, { recursive: true })
const binName = goos() === 'windows' ? 'mihomo.exe' : 'mihomo'
const outPath = join(outDir, binName)
const hash = computeGoHash(goDir)

console.log(`Building mihomo from go.mod (hash ${hash}) for ${goos()}/${goarch()}…`)
execFileSync(
  'go',
  ['build', '-trimpath', '-ldflags=-s -w', '-o', outPath, 'github.com/metacubex/mihomo'],
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
console.log('Wrote', outPath)
