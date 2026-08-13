import assert from 'node:assert/strict'

import {
  buildSparklinePaths,
  pointsToBezierPath,
  smoothEma,
} from '../src/renderer/src/lib/sparkline.ts'

assert.deepEqual(smoothEma([]), [])
assert.deepEqual(smoothEma([0, 0, 0]), [0, 0, 0])
assert.deepEqual(smoothEma([10, 10, 10]), [10, 10, 10])
assert.deepEqual(smoothEma([0, 100], 0.35), [0, 35])
assert.deepEqual(smoothEma([Number.NaN, -5, 10], 1), [0, 0, 10])

const peak = buildSparklinePaths([0, 1000, 0])
assert.equal(peak.points.length, 61)
assert.match(peak.line, /^M/)
assert.match(peak.line, / C/)
assert.ok(peak.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)))
assert.ok(peak.points.every((point) => point.y >= 0 && point.y <= 40))
assert.doesNotMatch(peak.line, /NaN|Infinity/)
assert.doesNotMatch(peak.area, /NaN|Infinity/)

const bounded = pointsToBezierPath([
  { x: 0, y: 40 },
  { x: 50, y: 0 },
  { x: 100, y: 40 },
])
assert.doesNotMatch(bounded, /NaN|Infinity/)

console.log('desktop sparkline tests passed')
