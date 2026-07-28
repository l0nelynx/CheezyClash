#!/usr/bin/env node
import { writeCoreManifest } from './core-manifest.mjs'

const [binaryPath, manifestPath, goDir, targetOs, targetArch] = process.argv.slice(2)
if (!binaryPath || !manifestPath || !goDir || !targetOs || !targetArch) {
  console.error(
    'usage: node write-core-manifest.mjs <binary> <manifest> <go-dir> <goos> <goarch>',
  )
  process.exit(2)
}

const manifest = writeCoreManifest(
  { binaryPath, goDir, targetOs, targetArch },
  manifestPath,
)
console.log(`Wrote ${manifestPath} (${manifest.moduleGraphHash})`)
