import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const psLiteral = value => `'${value.replaceAll("'", "''")}'`

export function extractZip(zipPath, extractDir) {
  mkdirSync(extractDir, { recursive: true })
  if (process.platform === 'win32') {
    // Node inherits PS7's module paths, but powershell.exe uses Windows PowerShell 5.1.
    // Let it construct its own module path instead of loading incompatible PS7 modules.
    const env = Object.fromEntries(Object.entries(process.env)
      .filter(([name]) => name.toUpperCase() !== 'PSMODULEPATH'))
    execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `$ErrorActionPreference = 'Stop'; Expand-Archive -Force -LiteralPath ${psLiteral(zipPath)} -DestinationPath ${psLiteral(extractDir)}`,
    ], { env, stdio: 'inherit', windowsHide: true })
  } else {
    execFileSync('unzip', ['-o', zipPath, '-d', extractDir], { stdio: 'inherit' })
  }
}
