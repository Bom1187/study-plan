import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const production = process.argv[2] !== 'dev'

function sendJson(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(data))
}

async function serveProductionFile(request, response, pathname) {
  let decodedPath
  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    sendJson(response, 400, { error: 'เส้นทางไฟล์ไม่ถูกต้อง' })
    return
  }
  const distDirectory = path.resolve(root, 'dist')
  const requestedFile = path.resolve(distDirectory, `.${decodedPath === '/' ? '/index.html' : decodedPath}`)
  if (!requestedFile.startsWith(`${distDirectory}${path.sep}`)) {
    sendJson(response, 403, { error: 'ไม่อนุญาตให้เข้าถึงไฟล์นี้' })
    return
  }
  try {
    const content = await readFile(requestedFile)
    const contentType = requestedFile.endsWith('.html')
      ? 'text/html; charset=utf-8'
      : requestedFile.endsWith('.js')
        ? 'text/javascript; charset=utf-8'
        : requestedFile.endsWith('.css')
          ? 'text/css; charset=utf-8'
          : requestedFile.endsWith('.svg')
            ? 'image/svg+xml'
            : requestedFile.endsWith('.png')
              ? 'image/png'
              : 'application/octet-stream'
    response.writeHead(200, {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': requestedFile.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    response.end(request.method === 'HEAD' ? undefined : content)
  } catch {
    if (path.extname(pathname)) {
      sendJson(response, 404, { error: 'ไม่พบไฟล์ที่ร้องขอ' })
      return
    }
    const index = await readFile(path.join(distDirectory, 'index.html'))
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
    response.end(index)
  }
}

const vite = production
  ? undefined
  : await (await import('vite')).createServer({
      configFile: path.join(root, 'vite.config.ts'),
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    })

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  if (url.pathname.startsWith('/api/')) {
    sendJson(response, 404, { error: 'ไม่พบ API ที่ร้องขอ' })
    return
  }
  if (!['GET', 'HEAD'].includes(request.method ?? '')) {
    sendJson(response, 405, { error: 'รองรับเฉพาะคำขอ GET และ HEAD' })
    return
  }
  if (vite) {
    vite.middlewares(request, response, (error) => {
      if (error) {
        vite.ssrFixStacktrace(error)
        console.error(error)
        if (!response.headersSent) sendJson(response, 500, { error: 'เกิดข้อผิดพลาดในการแสดงหน้าเว็บ' })
      }
    })
    return
  }
  await serveProductionFile(request, response, url.pathname)
})

const port = Number(process.env.PORT ?? 5173)
const host = process.env.HOST ?? '127.0.0.1'

server.listen(port, host, () => {
  console.log(`Studyflow ${production ? 'production' : 'development'} server: http://${host}:${port}`)
})

async function shutdown() {
  server.close()
  if (vite) await vite.close()
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
