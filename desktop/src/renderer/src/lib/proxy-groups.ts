import type { ProxyGroupInfo } from '../../../shared/types'

export function isSelectorGroup(type: string): boolean {
  return type.toLowerCase().includes('selector')
}

export function pickPrimaryGroup(groups: ProxyGroupInfo[]): ProxyGroupInfo | null {
  if (groups.length === 0) return null
  return groups.find((g) => isSelectorGroup(g.type)) ?? groups[0]!
}
