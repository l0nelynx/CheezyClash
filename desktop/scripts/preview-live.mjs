import { createRequire } from 'node:module'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
const require = createRequire(import.meta.url)
const arg = name => { const at=process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at+1] }
const source=arg('--source')
if (!source) throw new Error('Pass --source with the running client user-data directory')
const root=mkdtempSync(join(tmpdir(),'cheezy-live-ui-'))
const env={...process.env,CHEEZY_LIVE_SOURCE:source,CHEEZY_LIVE_DATA:root,CHEEZY_LIVE_LANGUAGE:arg('--language') ?? 'en',CHEEZY_LIVE_CAPTURE:process.argv.includes('--capture') ? '1' : ''}
delete env.ELECTRON_RUN_AS_NODE
console.log('Live UI data: '+root)
const child=spawn(require('electron'),[fileURLToPath(new URL('../out/main/live-ui.js',import.meta.url))],{env,windowsHide:false,stdio:'inherit'})
child.on('error',error=>{console.error(error);process.exitCode=1})
child.on('exit',code=>{process.exitCode=code??1})
