import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const [root, edition, tag] = process.argv.slice(2)
if (!['CheezyClash', 'CheezyVPN'].includes(edition) || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  throw new Error('Expected artifact directory, product name and stable vX.Y.Z tag')
}
const key = createPrivateKey(process.env.DESKTOP_UPDATE_PRIVATE_KEY || '')
const publicKey = createPublicKey(process.env.DESKTOP_UPDATE_PUBLIC_KEY || '')
if (key.asymmetricKeyType !== 'ed25519' || !createPublicKey(key).equals(publicKey)) {
  throw new Error('Desktop update signing keys do not match')
}
const files = []
async function add(platform, arch, format, directory, suffix) {
  const name = edition + '-' + suffix
  const path = join(root, edition + '-desktop-' + directory, name)
  const { size } = await stat(path)
  if (!size) throw new Error('Empty release file: ' + name)
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  files.push({ platform, arch, format, name, size, sha512: hash.digest('base64') })
}
await add('win32', 'x64', 'nsis', 'win', 'win-x64.exe')
await add('win32', 'x64', 'zip', 'win', 'win-x64.zip')
await add('linux', 'x64', 'AppImage', 'linux', 'linux-x86_64.AppImage')
await add('linux', 'x64', 'deb', 'linux', 'linux-amd64.deb')
for (const arch of ['arm64', 'x64']) {
  for (const ext of ['dmg', 'zip']) await add('darwin', arch, ext, 'mac-' + arch, 'mac-' + arch + '.' + ext)
}
const raw = Buffer.from(JSON.stringify({ schema: 1, edition, version: tag.slice(1), files }) + '\n')
const out = join(root, 'desktop-update')
await mkdir(out, { recursive: true })
await writeFile(join(out, 'desktop-update.json'), raw)
await writeFile(join(out, 'desktop-update.sig'), sign(null, raw, key))
