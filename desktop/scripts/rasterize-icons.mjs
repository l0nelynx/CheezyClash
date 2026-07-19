/**
 * Rasterize OS logos (exe / installer / tray) from logo-os.svg,
 * and colored logo-flat.png from logo.svg.
 * Crops transparent padding so the mark fills most of each PNG.
 * Does NOT touch in-app assets/logo.svg (UI mark stays adaptive-padded).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { Resvg } from '@resvg/resvg-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = join(root, 'build')
const resourcesDir = join(root, 'resources')

/** Keep a thin margin around the glyph (fraction of the final canvas). */
const PAD_RATIO = 0.04

mkdirSync(buildDir, { recursive: true })

function contentBBox(pixels, width, height, alphaThreshold = 8) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > alphaThreshold) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { minX, minY, maxX, maxY, bw: maxX - minX + 1, bh: maxY - minY + 1 }
}

/**
 * Render SVG → crop to opaque bounds → scale into a square PNG of `size`.
 */
function renderSvgTight(svgPath, size) {
  const svg = readFileSync(svgPath)
  // Render oversized so crop+scale stays sharp at the target size.
  const probeSize = Math.max(size * 4, 512)
  const probe = new Resvg(svg, {
    fitTo: { mode: 'width', value: probeSize },
    background: 'rgba(0,0,0,0)',
  }).render()

  const box = contentBBox(probe.pixels, probe.width, probe.height)
  if (!box) {
    throw new Error(`no opaque pixels in ${svgPath}`)
  }

  const fullPng = probe.asPng()
  const b64 = fullPng.toString('base64')
  const inner = size * (1 - 2 * PAD_RATIO)
  const scale = Math.min(inner / box.bw, inner / box.bh)
  const dw = box.bw * scale
  const dh = box.bh * scale
  const dx = (size - dw) / 2
  const dy = (size - dh) / 2

  // viewBox crop of the probe PNG, then place centered in the final square.
  const wrapper = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <image
    x="${dx}" y="${dy}" width="${dw}" height="${dh}"
    preserveAspectRatio="xMidYMid meet"
    xlink:href="data:image/png;base64,${b64}"
    clip-path="none"
  />
</svg>`

  // Use nested SVG with a clipped image via viewBox on a nested svg element —
  // more reliable than clip on <image> across resvg versions.
  const nested = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <svg x="${dx}" y="${dy}" width="${dw}" height="${dh}"
    viewBox="${box.minX} ${box.minY} ${box.bw} ${box.bh}"
    preserveAspectRatio="xMidYMid meet">
    <image width="${probe.width}" height="${probe.height}"
      xlink:href="data:image/png;base64,${b64}"/>
  </svg>
</svg>`

  void wrapper
  return new Resvg(nested, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
  })
    .render()
    .asPng()
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
const logoFlat = join(resourcesDir, 'logo.svg')
if (!existsSync(logoOs)) {
  console.error('missing resources/logo-os.svg')
  process.exit(1)
}
if (!existsSync(logoFlat)) {
  console.error('missing resources/logo.svg')
  process.exit(1)
}

const s16 = renderSvgTight(logoOs, 16)
const s32 = renderSvgTight(logoOs, 32)
const s48 = renderSvgTight(logoOs, 48)
const s64 = renderSvgTight(logoOs, 64)
const s256 = renderSvgTight(logoOs, 256)
const s512 = renderSvgTight(logoOs, 512)
const flat512 = renderSvgTight(logoFlat, 512)

writeFileSync(join(buildDir, 'icon.png'), s512)
writeFileSync(join(buildDir, 'icon-256.png'), s256)
writeFileSync(join(buildDir, 'icon.ico'), pngToIco([s16, s32, s48, s64, s256]))
writeFileSync(join(buildDir, 'logo-flat.png'), flat512)
writeFileSync(join(resourcesDir, 'tray.png'), s64)

// Legacy tray rasters under build/ (unused; tray ships from resources/).
for (const stale of ['tray-16.png', 'tray-128.png', 'tray.png']) {
  const p = join(buildDir, stale)
  if (existsSync(p)) {
    try {
      unlinkSync(p)
    } catch {
      /* ignore */
    }
  }
}

console.log(
  'icons: OS → build/icon.ico + resources/tray.png; colored → build/logo-flat.png (tight crop ~4% pad)',
)
