#!/usr/bin/env node
/**
 * Content hash of Go sources — same algorithm as build-core.yml / libclash action:
 * sha256 of (newline-separated per-file sha256 hex digests), first 16 chars.
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { createHash } from 'crypto'
import { join, relative } from 'path'

export function computeGoHash(dir) {
  function collect(base) {
    const out = []
    for (const name of readdirSync(base)) {
      const p = join(base, name)
      const st = statSync(p)
      if (st.isDirectory()) {
        out.push(...collect(p))
      } else if (name.endsWith('.go') || name === 'go.mod' || name === 'go.sum') {
        out.push(p)
      }
    }
    return out
  }

  // Match `find . … | LC_ALL=C sort` (paths like ./go.mod, ./native/main.go).
  const files = collect(dir).sort((a, b) => {
    const ra = './' + relative(dir, a).replace(/\\/g, '/')
    const rb = './' + relative(dir, b).replace(/\\/g, '/')
    return ra < rb ? -1 : ra > rb ? 1 : 0
  })

  const digests = []
  for (const file of files) {
    digests.push(createHash('sha256').update(readFileSync(file)).digest('hex'))
  }
  const payload = digests.length ? digests.join('\n') + '\n' : ''
  return createHash('sha256').update(payload).digest('hex').slice(0, 16)
}
