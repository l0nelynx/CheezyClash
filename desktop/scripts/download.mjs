import { createWriteStream } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { setTimeout as sleep } from 'node:timers/promises'
import { randomUUID } from 'node:crypto'

export async function download(url, dest, {
  fetchImpl = fetch, wait = sleep, timeoutMs = 180_000, attempts = 4,
} = {}) {
  const temporary = `${dest}.${randomUUID()}.part`
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const signal = AbortSignal.timeout(timeoutMs)
      const res = await fetchImpl(url, {
        headers: { 'User-Agent': 'CheezyClash-Desktop' },
        redirect: 'follow', signal,
      })
      if (!res.ok) {
        await res.body?.cancel().catch(() => {})
        const error = new Error(`download ${res.status}: ${url}`)
        error.status = res.status
        throw error
      }
      await pipeline(Readable.fromWeb(res.body), createWriteStream(temporary), { signal })
      await rename(temporary, dest)
      return
    } catch (error) {
      await rm(temporary, { force: true })
      const code = error.cause?.code ?? error.code
      const retryable = error.status === 408 || error.status === 429 || error.status >= 500 ||
        error instanceof TypeError || ['TimeoutError', 'AbortError'].includes(error.name) ||
        ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT'].includes(code)
      if (!retryable || attempt === attempts) throw error
      const delay = 2000 * 2 ** (attempt - 1)
      console.warn(`Download attempt ${attempt}/${attempts} failed: ${error.message}; retrying in ${delay / 1000}s`)
      await wait(delay)
    }
  }
}
