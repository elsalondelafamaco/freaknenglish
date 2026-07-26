#!/usr/bin/env node
/**
 * Capturas de pantalla en MODO OSCURO para revisar contraste.
 * Emula `prefers-color-scheme: dark` (el boot del tema lo respeta cuando no
 * hay preferencia guardada), navega a cada ruta y guarda un PNG.
 *
 * Uso: node scripts/shot-dark.mjs <carpetaSalida> <url1> [url2 ...]
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const wsDir = path.resolve('../storefront/node_modules/.pnpm')
const wsPkg = fs.readdirSync(wsDir).find((d) => /^ws@/.test(d))
const WebSocket = require(path.join(wsDir, wsPkg, 'node_modules', 'ws'))

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9444
const [outDir, ...urls] = process.argv.slice(2)
if (!outDir || urls.length === 0) {
  console.error('Uso: node scripts/shot-dark.mjs <salida> <url...>')
  process.exit(1)
}
fs.mkdirSync(outDir, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${path.resolve('.chrome-shot')}`, 'about:blank',
], { stdio: 'ignore' })

const main = async () => {
  for (let i = 0; i < 60; i++) {
    try { await fetch(`http://127.0.0.1:${PORT}/json/list`); break } catch { await sleep(300) }
  }
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 })
  await new Promise((r) => ws.once('open', r))
  let id = 0
  const pending = new Map()
  ws.on('message', (m) => {
    const x = JSON.parse(m)
    if (x.id && pending.has(x.id)) { pending.get(x.id)(x.result); pending.delete(x.id) }
  })
  const send = (method, params = {}) =>
    new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })

  await send('Page.enable')
  await send('Runtime.enable')
  // Tema oscuro por preferencia del sistema.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })

  for (const url of urls) {
    const nombre = (new URL(url).pathname.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home') + '.png'
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url })
    await sleep(3000)
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    if (shot?.data) fs.writeFileSync(path.join(outDir, nombre), Buffer.from(shot.data, 'base64'))
    console.log('✔', nombre)
  }
  ws.close(); chrome.kill(); process.exit(0)
}
main().catch((e) => { console.error(e); chrome.kill(); process.exit(1) })
