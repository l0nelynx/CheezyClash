import assert from 'node:assert/strict'
import { LatestWinsCoordinator } from '../src/main/lifecycle-coordinator.ts'

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function beforeSpawnLatestWins() {
  const entered = deferred()
  const release = deferred()
  const spawned = []
  const coordinator = new LatestWinsCoordinator(async ({ target }, isCurrent) => {
    if (target === 'A') {
      entered.resolve()
      await release.promise
    }
    if (!isCurrent()) return
    spawned.push(target)
  })
  const a = coordinator.request('A')
  await entered.promise
  const b = coordinator.request('B')
  release.resolve()
  await Promise.all([a, b])
  assert.deepEqual(spawned, ['B'])
}

async function duringStartupLatestWins() {
  const aSpawned = deferred()
  const aReady = deferred()
  const spawned = []
  const published = []
  const coordinator = new LatestWinsCoordinator(async ({ target }, isCurrent) => {
    spawned.push(target)
    if (target === 'A') {
      aSpawned.resolve()
      await aReady.promise
    }
    if (isCurrent()) published.push(target)
  })
  const a = coordinator.request('A')
  await aSpawned.promise
  const b = coordinator.request('B')
  aReady.resolve()
  await Promise.all([a, b])
  assert.deepEqual(spawned, ['A', 'B'])
  assert.deepEqual(published, ['B'])
}

async function threeRequestsCollapseToLast() {
  const entered = deferred()
  const release = deferred()
  const applied = []
  const coordinator = new LatestWinsCoordinator(async ({ target }, isCurrent) => {
    if (target === 'A') {
      entered.resolve()
      await release.promise
    }
    if (isCurrent()) applied.push(target)
  })
  const a = coordinator.request('A')
  await entered.promise
  const b = coordinator.request('B')
  const c = coordinator.request('C')
  release.resolve()
  await Promise.all([a, b, c])
  assert.deepEqual(applied, ['C'])
}

async function disconnectDuringConnect() {
  const spawned = deferred()
  const ready = deferred()
  const published = []
  const coordinator = new LatestWinsCoordinator(async ({ target }, isCurrent) => {
    if (target.running) {
      spawned.resolve()
      await ready.promise
    }
    if (isCurrent()) published.push(target.running)
  })
  const connect = coordinator.request({ running: true })
  await spawned.promise
  const disconnect = coordinator.request({ running: false })
  ready.resolve()
  await Promise.all([connect, disconnect])
  assert.deepEqual(published, [false])
}

async function recoversAfterFailure() {
  const applied = []
  const coordinator = new LatestWinsCoordinator(async ({ target }) => {
    if (target === 'broken') throw new Error('spawn failed')
    applied.push(target)
  })
  await assert.rejects(coordinator.request('broken'), /spawn failed/)
  await coordinator.request('recovered')
  assert.deepEqual(applied, ['recovered'])
}

await beforeSpawnLatestWins()
await duringStartupLatestWins()
await threeRequestsCollapseToLast()
await disconnectDuringConnect()
await recoversAfterFailure()
console.log('lifecycle coordinator tests passed')
