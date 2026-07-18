/**
 * Rasterize OS logos (exe / installer / tray) from logo-os.svg.
 * Does NOT touch in-app assets/logo.svg (colored UI mark).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { Resvg } from '@resvg/resvg-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = join(root, 'build')
const resourcesDir = join(root, 'resources')

mkdirSync(buildDir, { recursive: true })

function renderSvg(svgPath, size) {
  const svg = readFileSync(svgPath)
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
  })
  return resvg.render().asPng()
}

function pngToIco(pngBuffers) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngBuffers.length, 4)
  let offset = 6 + 16 * pngBuffers.length
  const dirs = []
  for (const png of pngBuffers) {
    const w = png.readUInt32BE(16)
    const h = png.readUInt32BE(20)
    const dir = Buffer.alloc(16)
    dir.writeUInt8(w >= 256 ? 0 : w, 0)
    dir.writeUInt8(h >= 256 ? 0 : h, 1)
    dir.writeUInt8(0, 2)
    dir.writeUInt8(0, 3)
    dir.writeUInt16LE(1, 4)
    dir.writeUInt16LE(32, 6)
    dir.writeUInt32LE(png.length, 8)
    dir.writeUInt32LE(offset, 12)
    dirs.push(dir)
    offset += png.length
  }
  return Buffer.concat([header, ...dirs, ...pngBuffers])
}

const logoOs = join(resourcesDir, 'logo-os.svg')
if (!existsSync(logoOs)) {
  console.error('missing resources/logo-os.svg')
  process.exit(1)
}

const s16 = renderSvg(logoOs, 16)
const s32 = renderSvg(logoOs, 32)
const s48 = renderSvg(logoOs, 48)
const s64 = renderSvg(logoOs, 64)
const s256 = renderSvg(logoOs, 256)
const s512 = renderSvg(logoOs, 512)

writeFileSync(join(buildDir, 'icon.png'), s512)
writeFileSync(join(buildDir, 'icon-256.png'), s256)
writeFileSync(join(buildDir, 'icon.ico'), pngToIco([s16, s32, s48, s64, s256]))
writeFileSync(join(resourcesDir, 'tray.png'), s64)

console.log('icons: OS black mark → build/icon.ico, resources/tray.png (64px); in-app logo untouched')
