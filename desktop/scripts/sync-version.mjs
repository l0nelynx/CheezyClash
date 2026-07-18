/**
 * Sync desktop/package.json version from app/version.properties
 */
import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const propsPath = join(desktopRoot, '..', 'app', 'version.properties')
const pkgPath = join(desktopRoot, 'package.json')

const props = readFileSync(propsPath, 'utf8')
const get = (k) => {
  const m = props.match(new RegExp(`^${k}=(\\S+)`, 'm'))
  if (!m) throw new Error(`Missing ${k} in version.properties`)
  return m[1].trim()
}
const version = `${get('VERSION_MAJOR')}.${get('VERSION_MINOR')}.${get('VERSION_BUILD')}`

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
if (pkg.version === version) {
  console.log(`version already ${version}`)
  process.exit(0)
}
pkg.version = version
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log(`synced desktop version → ${version}`)
