import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import afterPack from './after-pack.mjs'

const root = await mkdtemp(join(tmpdir(), 'cheezy-package-'))
const core = join(root, 'resources', 'core')
const dll = join(core, 'wintun.dll')
try {
  await mkdir(core, { recursive: true })
  const context = { electronPlatformName: 'win32', appOutDir: root }
  await assert.rejects(afterPack(context), /missing required wintun/)
  await writeFile(dll, '')
  await assert.rejects(afterPack(context), /missing required wintun/)
  await afterPack({ electronPlatformName: 'darwin' })
  console.log('Packaging rejects missing/empty Wintun on Windows only')
} finally {
  await unlink(dll).catch(error => { if (error.code !== 'ENOENT') throw error })
  await rmdir(core)
  await rmdir(join(root, 'resources'))
  await rmdir(root)
}
