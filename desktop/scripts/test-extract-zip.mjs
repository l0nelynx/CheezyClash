import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractZip } from './extract-zip.mjs'

const root = mkdtempSync(join(tmpdir(), 'cheezy-extract-'))
const modulePath = process.env.PSModulePath
try {
  // A foreign archive module must never be imported by Windows PowerShell.
  const foreignModules = join(root, 'foreign-modules')
  const archiveModule = join(foreignModules, 'Microsoft.PowerShell.Archive')
  mkdirSync(archiveModule, { recursive: true })
  writeFileSync(join(archiveModule, 'Microsoft.PowerShell.Archive.psm1'),
    "function Expand-Archive { throw 'Incompatible inherited archive module' }; Export-ModuleMember -Function Expand-Archive")
  process.env.PSModulePath = foreignModules
  const zipPath = join(root, "core's [archive].zip")
  const destination = join(root, "core's output")
  writeFileSync(zipPath, Buffer.from('UEsDBBQAAAAAAOq1c12sIhYPDQAAAA0AAAAPAAAAbmVzdGVkL2NvcmUudHh0dmVyaWZpZWQgY29yZVBLAQIUABQAAAAAAOq1c12sIhYPDQAAAA0AAAAPAAAAAAAAAAAAAACAAQAAAABuZXN0ZWQvY29yZS50eHRQSwUGAAAAAAEAAQA9AAAAOgAAAAAA', 'base64'))
  extractZip(zipPath, destination)
  assert.equal(readFileSync(join(destination, 'nested', 'core.txt'), 'utf8'), 'verified core')
  writeFileSync(join(destination, 'nested', 'core.txt'), 'stale')
  extractZip(zipPath, destination)
  assert.equal(readFileSync(join(destination, 'nested', 'core.txt'), 'utf8'), 'verified core')
  writeFileSync(zipPath, 'corrupt archive')
  assert.throws(() => extractZip(zipPath, destination))
  console.log('ZIP extraction passed: foreign modules, literal paths, overwrite and corrupt archive rejection')
} finally {
  if (modulePath === undefined) delete process.env.PSModulePath
  else process.env.PSModulePath = modulePath
  rmSync(root, { recursive: true, force: true })
}
