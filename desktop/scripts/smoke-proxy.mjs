#!/usr/bin/env node
/**
 * A7 smoke: start mihomo briefly with a minimal config and curl mixed-port.
 * Requires resources/core/mihomo(.exe) from fetch-core.
 */
import { spawn } from 'child_process'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { platform } from 'os'
import { tmpdir } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const bin = join(root, 'resources', 'core', platform() === 'win32' ? 'mihomo.exe' : 'mihomo')
if (!existsSync(bin)) {
  console.error('missing core — run npm run fetch-core')
  process.exit(1)
}

const home = join(tmpdir(), 'cheezy-smoke-home')
mkdirSync(home, { recursive: true })
const cfg = join(home, 'config.yaml')
writeFileSync(
  cfg,
  `
mixed-port: 17890
allow-lan: false
bind-address: 127.0.0.1
mode: direct
log-level: warning
external-controller: 127.0.0.1:19090
dns:
  enable: true
  enhanced-mode: fake-ip
  nameserver:
    - 8.8.8.8
`,
)

const child = spawn(bin, ['-d', home, '-f', cfg], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 1500))

try {
  const res = await fetch('http://127.0.0.1:19090/version')
  if (!res.ok) throw new Error('controller not ok')
  const ver = await res.json()
  console.log('smoke ok — version', ver)
  // proxy request via mixed-port CONNECT is harder; at least controller + port listen
  const net = await import('net')
  await new Promise((resolve, reject) => {
    const s = net.createConnection({ host: '127.0.0.1', port: 17890 }, () => {
      s.end()
      resolve()
    })
    s.on('error', reject)
  })
  console.log('mixed-port 17890 accepting connections')
} catch (e) {
  console.error('smoke failed', e)
  child.kill()
  process.exit(1)
}
child.kill()
process.exit(0)
