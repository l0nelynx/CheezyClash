export interface SparklinePoint {
  x: number
  y: number
}

export interface SparklinePaths {
  line: string
  area: string
  points: SparklinePoint[]
}

export function smoothEma(values: number[], alpha = 0.35): number[] {
  if (values.length === 0) return []
  const weight = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 0.35
  let current = Math.max(0, Number.isFinite(values[0]) ? values[0]! : 0)
  return values.map((value, index) => {
    const safe = Math.max(0, Number.isFinite(value) ? value : 0)
    if (index === 0) current = safe
    else current += weight * (safe - current)
    return current
  })
}

function n(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Catmull-Rom to cubic Bézier with control-point Y clamping to avoid overshoot. */
export function pointsToBezierPath(points: SparklinePoint[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${n(points[0]!.x)},${n(points[0]!.y)}`

  let path = `M${n(points[0]!.x)},${n(points[0]!.y)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const p3 = points[Math.min(points.length - 1, i + 2)]!
    const minY = Math.min(p1.y, p2.y)
    const maxY = Math.max(p1.y, p2.y)
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6, minY, maxY)
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6, minY, maxY)
    path += ` C${n(c1x)},${n(c1y)} ${n(c2x)},${n(c2y)} ${n(p2.x)},${n(p2.y)}`
  }
  return path
}

export function buildSparklinePaths(
  values: number[],
  options: { width?: number; height?: number; windowSize?: number; scaleMax?: number } = {},
): SparklinePaths {
  const width = options.width ?? 100
  const height = options.height ?? 40
  const windowSize = Math.max(2, options.windowSize ?? 60)
  const source = values.slice(-windowSize)
  const seed = Math.max(0, Number.isFinite(source[0]) ? source[0]! : 0)
  const padded = [...Array(Math.max(0, windowSize - source.length)).fill(seed), ...source]
  const smoothed = smoothEma(padded)
  const observedMax = Math.max(...smoothed, 1)
  const scaleMax = Math.max(options.scaleMax ?? observedMax, 1)
  const step = width / (windowSize - 1)
  const points = smoothed.map((value, index) => ({
    x: index * step,
    y: height - (Math.min(value, scaleMax) / scaleMax) * height * 0.9,
  }))
  const last = points.at(-1)!
  points.push({ x: width + step, y: last.y })
  const line = pointsToBezierPath(points)
  return {
    line,
    area: `${line} L${n(width + step)},${n(height)} L0.00,${n(height)} Z`,
    points,
  }
}
