import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { buildSparklinePaths, smoothEma } from '../lib/sparkline'

interface Props {
  values: number[]
  accentColor?: string
  className?: string
}

/** Smoothed, continuously scrolling area graph for download B/s. */
export function DownloadRateSparkline({
  values,
  accentColor,
  className,
}: Props): React.JSX.Element | null {
  const w = 100
  const h = 40
  const groupRef = useRef<SVGGElement>(null)
  const lastSampleAt = useRef(0)
  const scaleMax = useRef(1)
  const [reducedMotion, setReducedMotion] = useState(false)
  const rawId = useId().replace(/:/g, '')
  const gradientId = `dl-spark-fill-${rawId}`
  const clipId = `dl-spark-clip-${rawId}`
  const step = w / 59

  const observedMax = Math.max(...smoothEma(values.slice(-60)), 1)
  scaleMax.current = Math.max(observedMax, scaleMax.current * 0.92, 1)
  const paths = useMemo(
    () => buildSparklinePaths(values, { width: w, height: h, scaleMax: scaleMax.current }),
    [values],
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = (): void => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    lastSampleAt.current = performance.now()
  }, [values])

  useEffect(() => {
    const group = groupRef.current
    if (!group || reducedMotion) {
      group?.setAttribute('transform', 'translate(0 0)')
      return
    }
    let frame = 0
    const animate = (now: number): void => {
      if (document.visibilityState !== 'hidden') {
        const elapsed = Math.max(0, now - lastSampleAt.current)
        const progress = Math.min(1, elapsed / 1000)
        group.setAttribute('transform', `translate(${(-step * progress).toFixed(3)} 0)`)
      }
      frame = requestAnimationFrame(animate)
    }
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') lastSampleAt.current = performance.now()
    }
    document.addEventListener('visibilitychange', onVisibility)
    frame = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [reducedMotion, step])

  if (values.length === 0) return null

  const graphColor = /^#[0-9a-f]{6}$/i.test(accentColor || '') ? accentColor : 'currentColor'

  return (
    <svg
      className={`${className ?? ''} text-foreground`}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={graphColor} stopOpacity="0.14" />
          <stop offset="100%" stopColor={graphColor} stopOpacity="0.015" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect width={w} height={h} />
        </clipPath>
      </defs>
      <g ref={groupRef} clipPath={`url(#${clipId})`}>
        <path d={paths.area} fill={`url(#${gradientId})`} />
        <path
          d={paths.line}
          fill="none"
          stroke={graphColor}
          strokeOpacity="0.78"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}
