import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

export function parseGoBuildInfo(text) {
  const modules = new Map()
  const settings = {}
  let goVersion = ''
  let binaryPath = ''
  let previousModule = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (!line.includes('\t') && line.includes(': go')) {
      const marker = line.lastIndexOf(': go')
      binaryPath = line.slice(0, marker)
      goVersion = line.slice(marker + 2)
      continue
    }
    const fields = line.split('\t')
    const kind = fields[0]
    if ((kind === 'mod' || kind === 'dep') && fields[1]) {
      const module = {
        path: fields[1],
        version: fields[2] || '',
        replacement: null,
      }
      modules.set(module.path, module)
      previousModule = module
      continue
    }
    if (kind === '=>' && previousModule && fields[1]) {
      previousModule.replacement = {
        path: fields[1],
        version: fields[2] || '',
      }
      continue
    }
    if (kind === 'build' && fields[1]) {
      const setting = fields[1]
      const equals = setting.indexOf('=')
      if (equals >= 0) settings[setting.slice(0, equals)] = setting.slice(equals + 1)
      else settings[setting] = true
    }
  }

  return { binaryPath, goVersion, modules, settings }
}

export function readGoBuildInfo(binaryPath) {
  const text = execFileSync('go', ['version', '-m', binaryPath], { encoding: 'utf8' })
  return parseGoBuildInfo(text)
}

export function normalizedModules(info) {
  return [...info.modules.values()]
    .map((module) => ({
      path: module.path,
      version: module.version,
      replacementPath: module.replacement?.path || '',
      replacementVersion: module.replacement?.version || '',
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

export function moduleGraphHash(info) {
  return createHash('sha256').update(JSON.stringify(normalizedModules(info))).digest('hex')
}

export function moduleIdentity(module) {
  return JSON.stringify({
    version: module.version,
    replacementPath: module.replacement?.path || '',
    replacementVersion: module.replacement?.version || '',
  })
}
