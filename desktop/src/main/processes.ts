import { execFile } from 'child_process'
import { promisify } from 'util'
import { platform } from 'os'
import { log } from './logger'

const execFileAsync = promisify(execFile)

export interface ProcessEntry {
  name: string
  pid: number
}

/** Unique process names from the OS, sorted by name. */
export async function listRunningProcesses(): Promise<ProcessEntry[]> {
  if (platform() === 'win32') {
    return listWindowsProcesses()
  }
  return listUnixProcesses()
}

async function listWindowsProcesses(): Promise<ProcessEntry[]> {
  const script =
    "Get-Process | Where-Object { $_.ProcessName } | Select-Object Id, ProcessName | ConvertTo-Json -Compress"
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    )
    const parsed = JSON.parse(stdout.trim() || '[]') as
      | { Id: number; ProcessName: string }
      | { Id: number; ProcessName: string }[]
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    const byName = new Map<string, ProcessEntry>()
    for (const row of rows) {
      if (!row?.ProcessName) continue
      const name = row.ProcessName.toLowerCase().endsWith('.exe')
        ? row.ProcessName
        : `${row.ProcessName}.exe`
      if (!byName.has(name.toLowerCase())) {
        byName.set(name.toLowerCase(), { name, pid: Number(row.Id) || 0 })
      }
    }
    return [...byName.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    )
  } catch (e) {
    log(`processes:list failed: ${e}`, 'warn')
    return []
  }
}

async function listUnixProcesses(): Promise<ProcessEntry[]> {
  try {
    const { stdout } = await execFileAsync('ps', ['-A', '-o', 'pid=,comm='], {
      maxBuffer: 8 * 1024 * 1024,
    })
    const byName = new Map<string, ProcessEntry>()
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const m = /^(\d+)\s+(.+)$/.exec(trimmed)
      if (!m) continue
      const pid = Number(m[1])
      const name = m[2]!.trim()
      if (!name || byName.has(name)) continue
      byName.set(name, { name, pid })
    }
    return [...byName.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    )
  } catch (e) {
    log(`processes:list failed: ${e}`, 'warn')
    return []
  }
}
