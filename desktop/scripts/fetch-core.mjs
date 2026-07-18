#!/usr/bin/env node
/**
 * Download desktop mihomo sidecar for the host OS/arch into resources/core.
 *
 * Source: CheezyClash prerelease tag libclash-<go_hash>, asset
 *   mihomo-<go_hash>-<goos>-<goarch>.zip
 * where go_hash matches Android libclash (same Go sources under core/src/main/golang).
 *
 * Override arch with TARGET_ARCH=x64|arm64|amd64 (for CI cross-compile on macOS).
 * Override release repo with CORE_RELEASE_REPO (default: l0nelynx/CheezyClash).
 * Also fetches wintun.dll on Windows.
 *
 * No MetaCubeX fallback — on 404 run `npm run build-core` locally or wait for
 * build-core.yml to publish the hash on main.
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  chmodSync,
  readdirSync,
  statSync,
  rmSync,
} from 'fs'
import { pipeline } from 'stream/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { platform, arch } from 'os'
import { execFileSync } from 'child_process'
import { computeGoHash } from './go-hash.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const repoRoot = join(root, '..')
const goSources = join(repoRoot, 'core', 'src', 'main', 'golang')
const outDir = join(root, 'resources', 'core')
const releaseRepo = process.env.CORE_RELEASE_REPO || 'l0nelynx/CheezyClash'

function goos() {
  const p = platform()
  if (p === 'win32') return 'windows'
  if (p === 'darwin') return 'darwin'
  return 'linux'
}

function goarch() {
  // TARGET_ARCH: electron-builder style (x64|arm64) or Go style (amd64|arm64)
  const override = (process.env.TARGET_ARCH || process.env.npm_config_arch || '').toLowerCase()
  if (override === 'x64' || override === 'amd64') return 'amd64'
  if (override === 'arm64') return 'arm64'
  if (override === 'ia32' || override === '386') return '386'
  const a = arch()
  if (a === 'arm64') return 'arm64'
  if (a === 'ia32') return '386'
  return 'amd64'
}

async function download(url, dest) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CheezyClash-Desktop' },
    redirect: 'follow',
  })
  if (!res.ok) {
    const err = new Error(`download ${res.status}: ${url}`)
    err.status = res.status
    throw err
  }
  await pipeline(res.body, createWriteStream(dest))
}

async function fetchWintun() {
  if (goos() !== 'windows') return
  const dest = join(outDir, 'wintun.dll')
  if (existsSync(dest)) {
    console.log('wintun.dll already present')
    return
  }
  const url = 'https://www.wintun.net/builds/wintun-0.14.1.zip'
  const zipPath = join(outDir, 'wintun.zip')
  console.log('Downloading wintun…')
  try {
    await download(url, zipPath)
    const tmp = join(outDir, 'wintun-extract')
    mkdirSync(tmp, { recursive: true })
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${tmp}'`],
      { stdio: 'inherit' },
    )
    const archFolder = goarch() === 'arm64' ? 'arm64' : 'amd64'
    const dll = join(tmp, 'wintun', 'bin', archFolder, 'wintun.dll')
    if (existsSync(dll)) {
      renameSync(dll, dest)
      console.log('wintun.dll installed')
    } else {
      console.warn('wintun.dll not found in archive — place manually in resources/core')
    }
    try {
      unlinkSync(zipPath)
    } catch {
      /* ignore */
    }
  } catch (e) {
    console.warn('wintun download failed:', e.message || e)
    console.warn('Place wintun.dll into resources/core manually for TUN.')
  }
}

function extractZip(zipPath, extractDir) {
  mkdirSync(extractDir, { recursive: true })
  if (goos() === 'windows') {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${extractDir}'`,
      ],
      { stdio: 'inherit' },
    )
  } else {
    execFileSync('unzip', ['-o', zipPath, '-d', extractDir], { stdio: 'inherit' })
  }
}

function findBin(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      const f = findBin(p)
      if (f) return f
    } else if (/^mihomo(\.exe)?$/i.test(name)) {
      return p
    }
  }
  return null
}

async function main() {
  if (!existsSync(goSources)) {
    throw new Error(`Go sources not found at ${goSources}`)
  }

  const hash = computeGoHash(goSources)
  const os = goos()
  const archName = goarch()
  const asset = `mihomo-${hash}-${os}-${archName}.zip`
  const url = `https://github.com/${releaseRepo}/releases/download/libclash-${hash}/${asset}`

  console.log(`Go sources hash: ${hash}`)
  console.log(`Fetching ${url}`)

  mkdirSync(outDir, { recursive: true })
  const tmp = join(outDir, asset)

  try {
    await download(url, tmp)
  } catch (e) {
    if (e.status === 404) {
      throw new Error(
        `Core asset not published yet for hash ${hash} (${os}/${archName}).\n` +
          `Wait for build-core.yml on main to publish tag libclash-${hash}, or run:\n` +
          `  npm run build-core`,
      )
    }
    throw e
  }

  const binName = os === 'windows' ? 'mihomo.exe' : 'mihomo'
  const dest = join(outDir, binName)
  const extractDir = join(outDir, '_extract')
  try {
    rmSync(extractDir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  extractZip(tmp, extractDir)
  const found = findBin(extractDir)
  if (!found) throw new Error('mihomo binary not found in zip')
  if (existsSync(dest)) unlinkSync(dest)
  renameSync(found, dest)
  unlinkSync(tmp)
  rmSync(extractDir, { recursive: true, force: true })

  if (os !== 'windows') chmodSync(dest, 0o755)
  console.log('Wrote', dest)
  await fetchWintun()
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
