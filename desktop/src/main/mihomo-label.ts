import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { bundledCoreDir, desktopPackageRoot } from './paths'

const STOCK_MIHOMO_VERSION = '1.10.0'

/** Same as core/build.gradle.kts readMihomoVersion / desktop/scripts/mihomo-version.mjs */
export function readMihomoVersionFromGoMod(goModPath: string): string {
  if (!existsSync(goModPath)) return 'unknown'
  const lines = readFileSync(goModPath, 'utf8').split(/\r?\n/)

  const replaceRe = /^replace\s+github\.com\/metacubex\/mihomo\s*=>\s*(\S+)\s+(\S+)/
  for (const line of lines) {
    const m = replaceRe.exec(line.trim())
    if (m) {
      const path = m[1]!
      const version = m[2]!
      // Android UI: fork@pseudo-version (or bare pseudo-version if still metacubex).
      return path === 'github.com/metacubex/mihomo' ? version : `${path}@${version}`
    }
  }

  const requireRe = /github\.com\/metacubex\/mihomo\s+(\S+)/
  for (const line of lines) {
    const m = requireRe.exec(line)
    if (m) return m[1]!
  }
  return 'unknown'
}

function readLabelFile(path: string): string | null {
  if (!existsSync(path)) return null
  const version = readFileSync(path, 'utf8').trim()
  return version && isUsefulCoreLabel(version) ? version : null
}

function readManifestMihomoVersion(manifestPath: string): string | null {
  if (!existsSync(manifestPath)) return null
  try {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as { mihomoVersion?: unknown }
    const version = typeof raw.mihomoVersion === 'string' ? raw.mihomoVersion.trim() : ''
    return version && isUsefulCoreLabel(version) ? version : null
  } catch {
    return null
  }
}

/** Reject stock mihomo constant.Version and empty / garbage API values. */
export function isUsefulCoreLabel(version: string): boolean {
  const v = version.trim()
  if (!v || v === 'unknown' || v === STOCK_MIHOMO_VERSION) return false
  // Prefer Android-style labels: fork@pseudo or bare pseudo / semver from require.
  if (v.includes('@')) return true
  if (/^v?\d+\.\d+/.test(v)) return true
  if (v.startsWith('github.com/')) return true
  return false
}

export function resolveCoreVersionLabel(): {
  version: string
  source: 'go.mod' | 'api' | 'none'
} {
  const coreDir = bundledCoreDir()

  const fromTxt = readLabelFile(join(coreDir, 'mihomo-version.txt'))
  if (fromTxt) return { version: fromTxt, source: 'go.mod' }

  const fromManifest = readManifestMihomoVersion(join(coreDir, 'core-build.json'))
  if (fromManifest) return { version: fromManifest, source: 'go.mod' }

  const desktopRoot = desktopPackageRoot()
  const candidates = [
    join(desktopRoot, '..', 'core', 'src', 'main', 'golang', 'go.mod'),
    join(app.getAppPath(), '..', 'core', 'src', 'main', 'golang', 'go.mod'),
    join(process.cwd(), '..', 'core', 'src', 'main', 'golang', 'go.mod'),
    join(process.cwd(), 'core', 'src', 'main', 'golang', 'go.mod'),
  ]
  for (const goMod of candidates) {
    const version = readMihomoVersionFromGoMod(goMod)
    if (version !== 'unknown' && isUsefulCoreLabel(version)) {
      return { version, source: 'go.mod' }
    }
  }

  return { version: 'unknown', source: 'none' }
}
