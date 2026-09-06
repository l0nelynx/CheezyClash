import assert from 'node:assert/strict'
import { TrafficStream } from '../src/main/traffic-stream.ts'
let calls = 0, feed, signal
const monitor = new TrafficStream(async s => {
  signal = s; calls++
  return new Response(new ReadableStream({start(controller) { feed = controller }}))
})
const flush = () => new Promise(resolve => setImmediate(resolve))
try {
  monitor.sample(); monitor.sample()
  await flush()
  assert.equal(calls, 1)
  const bytes = new TextEncoder()
  feed.enqueue(bytes.encode('{"up":10,"down":'))
  await flush()
  assert.equal(monitor.sample().up, 0)
  feed.enqueue(bytes.encode('20,"upTotal":30,"downTotal":40}\n'))
  await flush()
  assert.deepEqual(monitor.sample(), {up:10, down:20, upTotal:30, downTotal:40})
  monitor.stop()
  assert.equal(signal.aborted, true)
  monitor.sample()
  await flush()
  assert.equal(calls, 2)
  assert.equal(monitor.sample().up, 0)
  feed.enqueue(bytes.encode('{"up":-1,"down":20,"upTotal":30,"downTotal":40}\n'))
  await flush()
  assert.equal(monitor.sample().up, 0)
  assert.equal(calls, 2, 'invalid stream uses retry backoff')
} finally { monitor.stop() }
console.log('traffic stream chunking, deduplication, reset and invalid frames passed')
