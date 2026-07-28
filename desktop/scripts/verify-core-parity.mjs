#!/usr/bin/env node
import { readGoBuildInfo, moduleIdentity } from './core-build-info.mjs'

const [desktopPath, androidPath] = process.argv.slice(2)
if (!desktopPath || !androidPath) {
  console.error('usage: node verify-core-parity.mjs <desktop-mihomo> <android-libclash.so>')
  process.exit(2)
}

const desktop = readGoBuildInfo(desktopPath)
const android = readGoBuildInfo(androidPath)
const mandatory = [
  'github.com/metacubex/mihomo',
  'github.com/metacubex/utls',
  'google.golang.org/protobuf',
]
const errors = []

for (const name of mandatory) {
  if (!desktop.modules.has(name)) errors.push(`desktop build is missing mandatory module ${name}`)
  if (!android.modules.has(name)) errors.push(`Android build is missing mandatory module ${name}`)
}

let common = 0
for (const [name, desktopModule] of desktop.modules) {
  const androidModule = android.modules.get(name)
  if (!androidModule) continue
  common++
  if (moduleIdentity(desktopModule) !== moduleIdentity(androidModule)) {
    errors.push(
      `${name}: desktop=${moduleIdentity(desktopModule)} Android=${moduleIdentity(androidModule)}`,
    )
  }
}

if (errors.length) {
  console.error(`Go module parity failed (${errors.length} mismatch(es)):`)
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}

console.log(`Go module parity passed: ${common} common modules`)
for (const name of mandatory) {
  console.log(`  ${name} ${moduleIdentity(desktop.modules.get(name))}`)
}
