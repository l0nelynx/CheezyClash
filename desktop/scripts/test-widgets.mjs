import {createRequire} from 'node:module'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
const require=createRequire(import.meta.url)
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const result=spawnSync(require('electron'),[fileURLToPath(new URL('widgets-smoke.cjs',import.meta.url)),mkdtempSync(join(tmpdir(),'cheezy-widgets-'))],{env,windowsHide:true,encoding:'utf8',timeout:60000})
process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');if(result.error)console.error(result.error);process.exitCode=result.status??1
