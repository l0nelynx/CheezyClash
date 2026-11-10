import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const port = Number(process.env.CHEEZY_UX_PORT || 4178)
const allowed = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/widgets.css', ['widgets.css', 'text/css; charset=utf-8']],
  ['/logo.svg', ['logo.svg', 'image/svg+xml']],
])
const server = createServer(async (request, response) => {
  const file = allowed.get(new URL(request.url, 'http://localhost').pathname)
  if (!file || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404).end('Not found')
    return
  }
  try {
    const data = await readFile(fileURLToPath(new URL(file[0], import.meta.url)))
    response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    response.end(request.method === 'HEAD' ? undefined : data)
  } catch {
    response.writeHead(500).end('Preview file unavailable')
  }
})
server.on('error', error => { console.error(error.message); process.exitCode = 1 })
server.listen(port, '127.0.0.1', () => console.log(`CheezyClash UX preview: http://127.0.0.1:${port}\nLocal demo only. Stop with Ctrl+C.`))
