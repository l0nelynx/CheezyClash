export function subscriptionLabel(raw: string): string {
  try { const url = new URL(raw); return `${url.origin}/…` } catch { return 'Subscription link' }
}

export function redactLog(line: string): string {
  return line.replace(/https?:\/\/[^\s"'<>]+/gi, subscriptionLabel)
    .replace(/((?:password|secret|token|authorization)\s*[:=]\s*)(?:Bearer\s+)?[^\s,;]+/gi, '$1[hidden]')
}
