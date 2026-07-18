import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { bundledCoreDir } from './paths'

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

export function resolveCoreVersionLabel(): {
  version: string
  source: 'go.mod' | 'api' | 'none'
} {
  const labelPath = join(bundledCoreDir(), 'mihomo-version.txt')
  if (existsSync(labelPath)) {
    const version = readFileSync(labelPath, 'utf8').trim()
    if (version) return { version, source: 'go.mod' }
  }

  const candidates = [
    join(app.getAppPath(), '..', 'core', 'src', 'main', 'golang', 'go.mod'),
    join(process.cwd(), '..', 'core', 'src', 'main', 'golang', 'go.mod'),
    join(process.cwd(), 'core', 'src', 'main', 'golang', 'go.mod'),
  ]
  for (const goMod of candidates) {
    const version = readMihomoVersionFromGoMod(goMod)
    if (version !== 'unknown') return { version, source: 'go.mod' }
  }

  return { version: 'unknown', source: 'none' }
}
