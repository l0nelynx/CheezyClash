export type UpdateFormat = 'nsis' | 'zip' | 'AppImage' | 'deb' | 'dmg'
export type UpdatePhase = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'installing' | 'manual' | 'error'

export interface DesktopUpdate {
  phase: UpdatePhase
  current: string
  latest?: string
  releasesUrl: string
  format?: UpdateFormat
  progress?: number
  error?: string
  showFile?: boolean
}
