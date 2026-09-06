import type { TrafficSnapshot } from '../shared/types'

const empty = (): TrafficSnapshot => ({ up: 0, down: 0, upTotal: 0, downTotal: 0 })

/** Mihomo /traffic is newline-delimited JSON, not a finite JSON response. */
export class TrafficStream {
  private controller: AbortController | null = null
  private idle: ReturnType<typeof setTimeout> | undefined
  private latest = empty()
  private retryAt = 0
  private open: (signal: AbortSignal) => Promise<Response>

  constructor(open: (signal: AbortSignal) => Promise<Response>) { this.open = open }

  sample(): TrafficSnapshot {
    clearTimeout(this.idle)
    this.idle = setTimeout(() => this.stop(), 3500)
    this.idle.unref?.()
    if (!this.controller && Date.now() >= this.retryAt) {
      const controller = new AbortController()
      this.controller = controller
      void this.consume(controller)
    }
    return { ...this.latest }
  }

  stop(): void {
    clearTimeout(this.idle)
    this.controller?.abort()
    this.controller = null
    this.latest = empty()
    this.retryAt = 0
  }

  private async consume(controller: AbortController): Promise<void> {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const resetWatchdog = (): void => {
      clearTimeout(watchdog)
      watchdog = setTimeout(() => controller.abort(), 8000)
      watchdog.unref?.()
    }
    try {
      resetWatchdog()
      const response = await this.open(controller.signal)
      if (!response.ok || !response.body) throw new Error('Traffic stream unavailable')
      reader = response.body.getReader()
      const decoder = new TextDecoder()
      let pending = ''
      while (!controller.signal.aborted) {
        const { value, done } = await reader.read()
        if (done) break
        pending += decoder.decode(value, { stream: true })
        if (pending.length > 65536) throw new Error('Traffic stream frame too large')
        let newline: number
        while ((newline = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, newline).trim()
          pending = pending.slice(newline + 1)
          if (!line) continue
          const sample = JSON.parse(line) as TrafficSnapshot
          if (![sample.up, sample.down, sample.upTotal, sample.downTotal].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)) {
            throw new Error('Invalid traffic sample')
          }
          if (this.controller !== controller || controller.signal.aborted) return
          this.latest = { up: sample.up, down: sample.down, upTotal: sample.upTotal, downTotal: sample.downTotal }
          resetWatchdog()
        }
      }
    } catch { /* Reconnect on the next visible sample request, with backoff. */ }
    finally {
      clearTimeout(watchdog)
      await reader?.cancel().catch(() => undefined)
      reader?.releaseLock()
      if (this.controller === controller) {
        this.controller = null
        this.latest = empty()
        this.retryAt = Date.now() + 3000
      }
    }
  }
}
