#!/usr/bin/env node
import { execFileSync } from 'child_process'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { platform } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const helperDir = join(root, 'helper')
const outDir = join(root, 'resources', 'helper')
mkdirSync(outDir, { recursive: true })

const isWin = platform() === 'win32'
const outName = isWin ? 'CheezyHelperService.exe' : 'cheezy-helper'
const outPath = join(outDir, outName)

console.log('Building helper…')
execFileSync(
  'go',
  ['build', '-o', outPath, '.'],
  { cwd: helperDir, stdio: 'inherit', env: { ...process.env, CGO_ENABLED: '0' } },
)

const coreName = isWin ? 'mihomo.exe' : 'mihomo'
const corePath = join(root, 'resources', 'core', coreName)
if (existsSync(corePath)) {
  const hash = createHash('sha256').update(readFileSync(corePath)).digest('hex')
  writeFileSync(join(outDir, 'allowed_core.sha256'), hash)
  console.log('allowed_core.sha256 =', hash)
}

console.log('Helper →', outPath)
