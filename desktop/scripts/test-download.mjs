import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, rmdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { download } from './download.mjs'

const directory = await mkdtemp(join(tmpdir(), 'cheezy-download-'))
const dest = join(directory, 'core.zip')
const url = 'https://example.invalid/core.zip'
try {
  let calls = 0
  const delays = []
  await download(url, dest, {
    fetchImpl: async () => ++calls < 3 ? new Response('gateway', { status: 504 }) : new Response('complete'),
    wait: async delay => { delays.push(delay) },
  })
  assert.equal(await readFile(dest, 'utf8'), 'complete')
  assert.deepEqual(delays, [2000, 4000])
  calls = 0
  await assert.rejects(download(url, dest, {
    fetchImpl: async () => { calls++; return new Response('missing', { status: 404 }) },
  }), error => error.status === 404)
  assert.equal(calls, 1)
  assert.equal(await readFile(dest, 'utf8'), 'complete')

  calls = 0
  await download(url, dest, {
    fetchImpl: async () => {
      if (++calls > 1) return new Response('replacement')
      let sent = false
      return new Response(new ReadableStream({ pull(controller) {
        if (!sent) { sent = true; controller.enqueue(new Uint8Array([1, 2, 3])) }
        else controller.error(new TypeError('connection terminated'))
      } }))
    }, wait: async () => {},
  })
  assert.equal(await readFile(dest, 'utf8'), 'replacement')
  calls = 0
  await writeFile(dest, 'preserve')
  // Keep Node alive while the unref'ed AbortSignal timer expires.
  const keepAlive = setInterval(() => {}, 1000)
  try {
    await assert.rejects(download(url, dest, {
      fetchImpl: async () => { calls++; return new Response(new ReadableStream({})) },
      timeoutMs: 20, attempts: 2, wait: async () => {},
    }), { name: 'AbortError' })
  } finally { clearInterval(keepAlive) }
  assert.equal(calls, 2)
  assert.equal(await readFile(dest, 'utf8'), 'preserve')
  assert.deepEqual(await readdir(directory), ['core.zip'])
  console.log('Download tests passed: 504 retry, permanent 404, interrupted body, timeout, atomic replacement and cleanup')
} finally {
  for (const name of await readdir(directory)) await rm(join(directory, name))
  await rmdir(directory)
}
