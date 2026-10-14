export type GroupLayout = 'list' | 'grid' | 'carousel'
export type ServerLayout = 'list' | 'large-grid' | 'small-grid'

export function readLayout<T extends string>(key: string, choices: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return choices.find((choice) => choice === value) ?? fallback
  } catch {
    return fallback
  }
}

export function saveLayout(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* Keep the current session's choice. */ }
}
