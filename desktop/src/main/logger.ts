import { BrowserWindow } from 'electron'

const MAX = 500
const lines: string[] = []
const listeners = new Set<(line: string) => void>()

export function log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  const line = `[${new Date().toISOString()}] [${level}] ${message}`
  lines.push(line)
  if (lines.length > MAX) lines.shift()
  for (const l of Array.from(listeners)) l(line)
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('logs:line', line)
  }
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export function getLogs(): string[] {
  return [...lines]
}

export function onLog(cb: (line: string) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
