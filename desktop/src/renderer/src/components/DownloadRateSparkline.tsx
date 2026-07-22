interface Props {
  values: number[]
  className?: string
}

/** Soft area sparkline for download B/s (viewBox 0..100 × 0..40). */
export function DownloadRateSparkline({ values, className }: Props): React.JSX.Element | null {
  if (values.length < 2) return null

  const max = Math.max(...values, 1)
  const w = 100
  const h = 40
  const n = values.length
  const pts = values.map((v, i) => {
    const x = n === 1 ? 0 : (i / (n - 1)) * w
    const y = h - (v / max) * h * 0.92
    return { x, y }
  })

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`

  return (
    <svg
      className={className}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="dl-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.985 0 0)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="oklch(0.985 0 0)" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="dl-spark-stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="oklch(0.985 0 0)" stopOpacity="0.15" />
          <stop offset="55%" stopColor="oklch(0.985 0 0)" stopOpacity="0.75" />
          <stop offset="100%" stopColor="oklch(0.985 0 0)" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#dl-spark-fill)" />
      <path
        d={line}
        fill="none"
        stroke="url(#dl-spark-stroke)"
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
