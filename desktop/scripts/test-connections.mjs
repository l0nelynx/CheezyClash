import assert from 'node:assert/strict'
import { connectionRates, connectionDuration, connectionRoute, matchesConnection } from '../src/renderer/src/lib/connections.ts'
import fixture from './connections-fixture.cjs'

const previous = fixture.snapshot()
const current = structuredClone(previous)
current.sampledAt += 2500
current.connections[0].download += 5000
current.connections[0].upload += 1000
let rows = connectionRates(current, previous)
assert.equal(rows[0].downRate, 2000)
assert.equal(rows[0].upRate, 400)
assert.equal(connectionRates(current, null)[0].downRate, null, 'first sample cannot report speed')
assert.equal(connectionRates(previous, previous)[0].downRate, null, 'zero sampling interval')
current.connections[0].download = 0
assert.equal(connectionRates(current, previous)[0].downRate, null, 'reset counters must not produce a negative speed')
current.connections[0].start = new Date().toISOString()
assert.equal(connectionRates(current, previous)[0].upRate, null, 'a reused ID with a different start is a new connection')
assert.equal(connectionRates({connections:[],sampledAt:current.sampledAt}, previous).length, 0, 'closed connections disappear')
assert.deepEqual(connectionRoute(previous.connections[0]), ['Streaming', 'Auto', 'NL · Amsterdam'])
assert.deepEqual(previous.connections[0].chains, ['NL · Amsterdam', 'Auto', 'Streaming'], 'do not mutate the snapshot')
assert.equal(matchesConnection(previous.connections[0], 'CHROME.EXE'), true)
assert.equal(matchesConnection(previous.connections[0], 'youtube.com'), true)
assert.equal(matchesConnection(previous.connections[0], 'streaming'), true)
assert.equal(matchesConnection(previous.connections[0], 'not-present'), false)
assert.equal(connectionDuration('2026-01-01T00:00:00Z', Date.parse('2026-01-01T01:02:03Z')), '1:02:03')
assert.equal(connectionDuration('2026-01-01T00:00:00Z', Date.parse('2026-01-01T00:01:09Z')), '1:09')
assert.equal(connectionDuration('invalid', Date.now()), '—')
assert.equal(connectionDuration('2026-01-02T00:00:00Z', Date.parse('2026-01-01T00:00:00Z')), '0:00')
console.log('Connections: sample timing, resets, new/closed trackers, route order, search and duration passed')
