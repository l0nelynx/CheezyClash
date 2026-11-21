import { createHash, createPublicKey, verify } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { UpdateFormat } from '../shared/desktop-update'

export const repositories = {
  CheezyClash: 'l0nelynx/CheezyClash',
  CheezyVPN: 'l0nelynx/CheezyVPN-Releases',
} as const
export type Edition = keyof typeof repositories
export interface UpdateAsset {
  platform: string
  arch: string
  format: UpdateFormat
  name: string
  size: number
  sha512: string
}

export function newer(version: string, current: string): boolean {
  const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
  if (!stable.test(version) || !stable.test(current)) throw new Error('Invalid stable release version')
  const parts = current.split('.').map(BigInt)
  for (const [i, value] of version.split('.').map(BigInt).entries()) {
    if (value !== parts[i]) return value > parts[i]!
  }
  return false
}

export function selectAsset(raw: Buffer, signature: Buffer, key: string, edition: Edition,
  version: string, platform: string, arch: string, format: UpdateFormat): UpdateAsset {
  const publicKey = createPublicKey(key)
  if (publicKey.asymmetricKeyType !== 'ed25519' || !verify(null, raw, publicKey, signature)) {
    throw new Error('Invalid desktop update signature')
  }
  const data = JSON.parse(raw.toString('utf8'))
  if (data.schema !== 1 || data.edition !== edition || data.version !== version || !Array.isArray(data.files)) {
    throw new Error('Desktop release does not match this installation')
  }
  const matches = data.files.filter((f: UpdateAsset) => f.platform === platform && f.arch === arch && f.format === format)
  const file: UpdateAsset = matches[0]
  if (matches.length !== 1 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(file.name) ||
      !file.name.startsWith(edition + '-') || !file.name.endsWith('.' + (format === 'nsis' ? 'exe' : format)) ||
      !Number.isSafeInteger(file.size) || file.size <= 0 || !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512)) {
    throw new Error('Missing or invalid desktop update asset')
  }
  return file
}

export async function verifyFile(path: string, asset: UpdateAsset): Promise<void> {
  if ((await stat(path)).size !== asset.size) throw new Error('Incomplete desktop update')
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  if (hash.digest('base64') !== asset.sha512) throw new Error('Desktop update checksum mismatch')
}
