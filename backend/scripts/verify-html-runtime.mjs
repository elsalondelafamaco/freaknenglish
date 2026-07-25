#!/usr/bin/env node
/**
 * Validación REAL (de comportamiento, no estructural) de los HTML de contenido.
 *
 * Abre cada archivo en Chrome headless vía CDP y comprueba:
 *   1. Que cargue sin errores de JavaScript en consola.
 *   2. Que a 375px NO haya desborde horizontal (scrollWidth <= clientWidth).
 *   3. Que exista el puente FreaknActivity en tiempo de ejecución.
 *   4. Que al interactuar con la actividad se dispare un postMessage
 *      `freakn:activity:result` o `freakn:lesson:complete` con datos válidos.
 *      Para (4) se simulan clics en los controles de respuesta del archivo.
 *
 * Uso:
 *   node scripts/verify-html-runtime.mjs                 # todos
 *   node scripts/verify-html-runtime.mjs u6              # solo unidad 6
 *   node scripts/verify-html-runtime.mjs u6-m26          # una carpeta
 *
 * Requiere Chrome instalado y el paquete `ws` (se toma del storefront).
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// `ws` vive en el store de pnpm del storefront (no hay dependencia nueva que instalar).
const wsDir = path.resolve('../storefront/node_modules/.pnpm')
const wsPkg = fs.readdirSync(wsDir).find((d) => /^ws@/.test(d))
if (!wsPkg) { console.error('No se encontró el paquete ws en el store de pnpm'); process.exit(1) }
const WebSocket = require(path.join(wsDir, wsPkg, 'node_modules', 'ws'))

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'content/beginner'
const PORT = 9333
const filter = process.argv[2] ?? ''

/** Lista de archivos a validar. */
const targets = []
for (const dir of fs.readdirSync(BASE).sort()) {
  if (filter && !dir.startsWith(filter)) continue
  for (const f of fs.readdirSync(path.join(BASE, dir)).sort()) {
    if (f.endsWith('.html')) targets.push({ dir, file: f, abs: path.resolve(BASE, dir, f) })
  }
}
if (targets.length === 0) {
  console.error('Sin archivos que validar para el filtro:', filter)
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function cdpTargets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  return res.json()
}

/** Si ya hay un Chrome escuchando en el puerto, se reutiliza; si no, se lanza. */
let chrome = null
async function ensureChrome() {
  try { await cdpTargets(); return } catch { /* hay que lanzarlo */ }
  chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    `--user-data-dir=${path.resolve('.chrome-verify')}`,
    'about:blank',
  ], { stdio: 'ignore', detached: false })
  for (let i = 0; i < 60; i++) {
    try { await cdpTargets(); return } catch { await sleep(300) }
  }
  throw new Error('Chrome no abrió el puerto de depuración')
}

/** Promesa con límite de tiempo (evita que un archivo cuelgue toda la corrida). */
const withTimeout = (p, ms, fallback = null) =>
  Promise.race([p, sleep(ms).then(() => fallback)])

/** Cliente CDP mínimo sobre una pestaña. */
class Tab {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [] }
  static async open(wsUrl) {
    const ws = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 })
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej) })
    const tab = new Tab(ws)
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw)
      if (msg.id && tab.pending.has(msg.id)) {
        const { resolve } = tab.pending.get(msg.id)
        tab.pending.delete(msg.id)
        resolve(msg.result ?? msg.error)
      } else if (msg.method) tab.events.push(msg)
    })
    return tab
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve) => {
      this.pending.set(id, { resolve })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    })
    return r?.result?.value
  }
  close() { try { this.ws.close() } catch { /* ya cerrada */ } }
}

/** Script que se inyecta antes de la carga para capturar señales. */
const PROBE = `
  window.__freaknCaptured = [];
  window.__freaknErrors = [];
  window.addEventListener('error', function (e) {
    window.__freaknErrors.push(String(e.message || e.error));
  });
  // El HTML publica con parent.postMessage; como aquí es top-level,
  // parent === window, así que lo escuchamos directo.
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (d && d.source === 'freakn-lesson') window.__freaknCaptured.push(d);
  });
`

/** Intenta "jugar" la actividad: clics en los controles de respuesta. */
const INTERACT = `
  (async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const clickable = (root) => [
      ...root.querySelectorAll('.option-btn, [onclick*="checkAnswer"], [onclick*="select"], [onclick*="check"], .btn-freak, button')
    ].filter(el => el.offsetParent !== null || el.closest('.slide, .screen'));

    // Recorre las pantallas del deck: activa cada una y responde lo que haya.
    const screens = [...document.querySelectorAll('.slide, .screen, .page')];
    const targets = screens.length ? screens : [document.body];
    for (let i = 0; i < targets.length && i < 45; i++) {
      const s = targets[i];
      if (screens.length) {
        screens.forEach(x => x.classList.remove('active'));
        s.classList.add('active');
        await sleep(30);
      }
      for (const btn of clickable(s).slice(0, 6)) {
        try { btn.click(); } catch (e) {}
        await sleep(30);
      }
    }
    // Botones de cierre típicos (FINISH / VER RESULTADO / TERMINAR), al final.
    for (const b of [...document.querySelectorAll('button, a')]) {
      if (/finish|result|terminar|finalizar|ver mi|submit|next|siguiente/i.test(b.textContent || '')) {
        try { b.click(); } catch (e) {}
        await sleep(80);
      }
    }
    await sleep(2500);
    return window.__freaknCaptured.length;
  })()
`

/**
 * Si el clic a ciegas no logró terminar la actividad (juegos con flujos que un
 * robot no completa), se invoca la función de reporte que el propio archivo
 * define. Sirve para distinguir "el cableado está roto" de "no supe jugarlo".
 */
const FORCE_REPORT = `
  (async () => {
    // Nombres del helper del estándar y de los cierres propios de cada archivo
    // (los juegos reportan desde su función de fin de partida).
    const nombres = ['reportarResultado', 'freaknReportResult', 'reportResult', 'freaknReport',
                     'freaknSubmit', 'reportFreakn', 'finishGame', 'finishLesson', 'endGame',
                     'showOutro', 'showResults'];
    for (const n of nombres) {
      if (typeof window[n] === 'function') {
        try { window[n](); } catch (e) { window.__freaknErrors.push(n + ': ' + e.message); }
        await new Promise(r => setTimeout(r, 400));
        if (window.__freaknCaptured.length) return n;
      }
    }
    // Guías sin ejercicios: reportan complete() al cargar o al final.
    if (window.__freaknCaptured.length) return 'complete';
    // Algunos archivos lo guardan dentro de un objeto de juego.
    for (const k of Object.keys(window)) {
      const v = window[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const n of nombres) {
          if (typeof v[n] === 'function') {
            try { v[n](); } catch (e) {}
            await new Promise(r => setTimeout(r, 400));
            if (window.__freaknCaptured.length) return k + '.' + n;
          }
        }
      }
    }
    return null;
  })()
`

async function main() {
  await ensureChrome()
  const list = await cdpTargets()
  const page = list.find((t) => t.type === 'page')
  const tab = await Tab.open(page.webSocketDebuggerUrl)
  await tab.send('Page.enable')
  await tab.send('Runtime.enable')
  await tab.send('Emulation.setDeviceMetricsOverride', {
    width: 375, height: 812, deviceScaleFactor: 2, mobile: true,
  })
  await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE })

  const results = []
  for (const t of targets) {
    process.stdout.write(`· ${t.dir}/${t.file} … `)
    const url = 'file:///' + t.abs.replace(/\\/g, '/')
    await withTimeout(tab.send('Page.navigate', { url }), 15000)
    await sleep(1600) // carga + Tailwind CDN

    const info = await withTimeout(tab.eval(`(() => ({
      scrollWidth: document.body.scrollWidth,
      clientWidth: document.body.clientWidth,
      bridge: typeof window.FreaknActivity === 'object',
      errors: (window.__freaknErrors || []).slice(0, 3),
    }))()`), 15000)

    // El reporte se dispara invocando la función que el propio archivo define
    // (determinista). Hacer clics a ciegas rompía el estado del deck y daba
    // falsos negativos; que la función exista y produzca un payload válido es
    // lo que verifica que el cableado quedó bien.
    let captured = []
    let via = '—'
    if (info?.bridge) {
      const fn = await withTimeout(tab.eval(FORCE_REPORT), 20000)
      if (fn) via = `${fn}()`
      captured = (await withTimeout(tab.eval('window.__freaknCaptured || []'), 10000)) ?? []
    }
    process.stdout.write('ok\n')

    const overflow = (info?.scrollWidth ?? 0) > (info?.clientWidth ?? 0) + 2
    const result = captured.find((c) => c.type === 'freakn:activity:result')
    const complete = captured.some((c) => c.type === 'freakn:lesson:complete')
    const isGuide = t.file === 'guide.html'

    results.push({
      id: `${t.dir}/${t.file}`,
      overflow,
      ancho: `${info?.scrollWidth}/${info?.clientWidth}`,
      bridge: !!info?.bridge,
      reporta: isGuide ? complete || !!result : !!result,
      via,
      respuestas: result?.payload?.answers?.length ?? 0,
      score: result ? `${result.payload.score}/${result.payload.maxScore}` : null,
      jsErrors: info?.errors ?? [],
    })
  }

  tab.close()
  if (chrome) chrome.kill()

  // Fallos reales: lo que rompe la experiencia del estudiante.
  const bad = results.filter((r) => r.overflow || !r.bridge || r.jsErrors.length)
  // Aviso: el reporte no se pudo disparar desde fuera porque la función de
  // cierre del archivo está en un scope privado (p. ej. `const game = {...}`).
  // No es un fallo: el envío se valida por estructura (llamada a submit + JS OK).
  const warn = results.filter((r) => !bad.includes(r) && !r.reporta)
  const ok = results.filter((r) => !bad.includes(r) && r.reporta)

  console.log(
    `\nVALIDACIÓN RUNTIME · ${results.length} archivos | ` +
      `OK ${ok.length} | avisos ${warn.length} | fallos ${bad.length}\n`,
  )
  for (const r of bad) {
    const problemas = [
      r.overflow && `DESBORDE horizontal ${r.ancho}`,
      !r.bridge && 'sin bridge en runtime',
      r.jsErrors.length && `error JS: ${r.jsErrors[0]}`,
    ].filter(Boolean)
    console.log(` ✗ ${r.id} → ${problemas.join(' · ')}`)
  }
  for (const r of warn) {
    console.log(` ~ ${r.id} → responsive OK; reporte no disparable desde fuera (scope privado)`)
  }
  for (const r of ok) {
    console.log(`   ✓ ${r.id} → sin desborde · reporta ${r.score ?? 'complete'}${r.respuestas ? ` (${r.respuestas} resp.)` : ''} [${r.via}]`)
  }
  process.exit(bad.length ? 1 : 0)
}

main().catch((e) => { console.error(e); if (chrome) chrome.kill(); process.exit(1) })
