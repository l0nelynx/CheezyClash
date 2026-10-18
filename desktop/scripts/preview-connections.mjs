import { createRequire } from 'node:module'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
const require = createRequire(import.meta.url)
const env = {...process.env}
delete env.ELECTRON_RUN_AS_NODE
const root = mkdtempSync(join(tmpdir(), 'cheezy-connections-'))
const child = spawn(require('electron'), [fileURLToPath(new URL('connections-preview.cjs', import.meta.url)), root, ...process.argv.slice(2)], {env, windowsHide:true, stdio:'inherit'})
child.on('error', error => {console.error(error);process.exitCode=1})
child.on('exit', code => {process.exitCode=code ?? 1})
