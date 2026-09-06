export async function downloadSubscription(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
  limits = { timeoutMs: 30_000, maxBytes: 16 * 1024 * 1024 },
): Promise<{ text: string; headers: Headers }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), limits.timeoutMs)
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
  try {
    let response: Response | undefined
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (new URL(url).protocol !== 'https:') throw new Error('Only HTTPS subscription URLs are allowed')
      response = await fetch(url, { headers, redirect: 'manual', signal: combined })
      if (![301, 302, 303, 307, 308].includes(response.status)) break
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (!location || redirects === 5) throw new Error('Too many or invalid subscription redirects')
      url = new URL(location, url).href
    }
    if (!response!.ok) {
      await response!.body?.cancel()
      throw new Error(`Subscription server returned HTTP ${response!.status}. Please try again.`)
    }
    if (Number(response!.headers.get('content-length')) > limits.maxBytes) {
      await response!.body?.cancel()
      throw new Error('Subscription exceeds the 16 MB size limit')
    }
    const reader = response!.body?.getReader()
    if (!reader) throw new Error('Empty subscription response')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > limits.maxBytes) throw new Error('Subscription exceeds the 16 MB size limit')
        chunks.push(value)
      }
    } finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
    combined.throwIfAborted()
    return { text: Buffer.concat(chunks).toString('utf8'), headers: response!.headers }
  } catch (error) {
    if (signal?.aborted) throw new Error('Subscription download canceled.')
    if (controller.signal.aborted) throw new Error('Subscription download timed out. Please try again.')
    throw error
  } finally {
    clearTimeout(timer)
  }
}
