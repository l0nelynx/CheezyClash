#!/usr/bin/env node
/**
 * Same logic as core/build.gradle.kts readMihomoVersion():
 * replace → "<fork>@<pseudo-version>", else require version.
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function defaultGoModPath() {
  return join(__dirname, '..', '..', 'core', 'src', 'main', 'golang', 'go.mod')
}

export function readMihomoVersion(goModPath = defaultGoModPath()) {
  if (!existsSync(goModPath)) return 'unknown'
  const lines = readFileSync(goModPath, 'utf8').split(/\r?\n/)

  const replaceRe = /^replace\s+github\.com\/metacubex\/mihomo\s*=>\s*(\S+)\s+(\S+)/
  for (const line of lines) {
    const m = replaceRe.exec(line.trim())
    if (m) {
      const path = m[1]
      const version = m[2]
      return path === 'github.com/metacubex/mihomo' ? version : `${path}@${version}`
    }
  }

  const requireRe = /github\.com\/metacubex\/mihomo\s+(\S+)/
  for (const line of lines) {
    const m = requireRe.exec(line)
    if (m) return m[1]
  }
  return 'unknown'
}

const isMain =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isMain) {
  console.log(readMihomoVersion())
}
