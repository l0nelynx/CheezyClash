import assert from 'node:assert/strict'
import { downloadSubscription } from '../src/main/subscription-download.ts'
const original = globalThis.fetch
try {
  globalThis.fetch = async () => new Response('proxies: []')
  assert.equal((await downloadSubscription('https://example.invalid', {})).text, 'proxies: []')
  globalThis.fetch = async () => new Response('12345')
  await assert.rejects(downloadSubscription('https://example.invalid', {}, undefined, { timeoutMs: 100, maxBytes: 4 }), /size limit/)
  globalThis.fetch = async () => new Response('secret token', {status: 403})
  await assert.rejects(downloadSubscription('https://example.invalid', {}), e => /403/.test(e.message) && !/secret token/.test(e.message))
  let calls = 0
  globalThis.fetch = async () => { calls++; return new Response(null, {status: 302, headers: {location: 'http://example.invalid'}}) }
  await assert.rejects(downloadSubscription('https://example.invalid', {}), /HTTPS/)
  assert.equal(calls, 1)
  globalThis.fetch = async (_url, {signal}) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {once: true})
  })
  await assert.rejects(downloadSubscription('https://example.invalid', {}, undefined, {timeoutMs: 5, maxBytes: 100}), /timed out/)
  const controller = new AbortController()
  const pending = downloadSubscription('https://example.invalid', {}, controller.signal)
  controller.abort()
  await assert.rejects(pending, /canceled/)
} finally { globalThis.fetch = original }
console.log('subscription download limits, redirects, errors and cancellation passed')
