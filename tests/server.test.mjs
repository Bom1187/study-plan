import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let appProcess
let appUrl

async function waitForApp() {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (appProcess.exitCode !== null) throw new Error('Studyflow server exited before becoming ready')
    try {
      const response = await fetch(appUrl)
      if (response.ok) return
    } catch {
      await delay(50)
    }
  }
  throw new Error('Studyflow server did not become ready')
}

before(async () => {
  const appPort = await new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port
      probe.close((error) => error ? reject(error) : resolve(port))
    })
  })
  appUrl = `http://127.0.0.1:${appPort}`
  appProcess = spawn(process.execPath, ['server.mjs', 'dev'], {
    cwd: root,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(appPort) },
    stdio: 'ignore',
  })
  await waitForApp()
})

after(async () => {
  if (appProcess && appProcess.exitCode === null) {
    const exited = once(appProcess, 'exit')
    appProcess.kill('SIGTERM')
    await exited
  }
})

test('serves the development app shell', async () => {
  const response = await fetch(appUrl)
  const html = await response.text()
  assert.equal(response.status, 200)
  assert.match(html, /<div id="root">/)
})

test('does not expose the retired plan API', async () => {
  const response = await fetch(`${appUrl}/api/plan`, { method: 'POST' })
  const result = await response.json()
  assert.equal(response.status, 404)
  assert.match(result.error, /ไม่พบ API/)
})

test('rejects unsupported methods for app routes', async () => {
  const response = await fetch(appUrl, { method: 'POST' })
  assert.equal(response.status, 405)
})
