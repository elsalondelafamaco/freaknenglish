#!/usr/bin/env node
/**
 * Procesa una lección HTML cruda (Drive) al estándar Freakn:
 *   1. Asegura <meta name="viewport"> (responsive real en mobile).
 *   2. Inyecta content/_shared/freakn-standard.html (CSS overrides + bridge
 *      FreaknActivity) justo antes de </head> (o al inicio si no hay head).
 *
 * Uso:  node scripts/process-lesson.mjs <entrada.html> <salida.html>
 *       node scripts/process-lesson.mjs --dir <folderEntrada> <folderSalida>
 *
 * Después de procesar, cablear manualmente cada actividad para que al calificar
 * llame a FreaknActivity.submit({activityId, title, score, maxScore, answers}).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const SHARED = fs.readFileSync(path.join(here, '..', 'content', '_shared', 'freakn-standard.html'), 'utf8')

function processHtml(raw) {
  let html = raw
  // 1. Viewport
  if (!/name=["']viewport["']/i.test(html)) {
    const meta = '<meta name="viewport" content="width=device-width, initial-scale=1">'
    if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${meta}`)
    else html = `${meta}\n${html}`
  }
  // 2. Fragmento estándar (idempotente)
  if (!html.includes('id="freakn-bridge"')) {
    if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${SHARED}\n</head>`)
    else if (/<body[^>]*>/i.test(html)) html = html.replace(/<body[^>]*>/i, (m) => `${m}\n${SHARED}`)
    else html = `${SHARED}\n${html}`
  }
  return html
}

function processFile(inFile, outFile) {
  const raw = fs.readFileSync(inFile, 'utf8')
  const out = processHtml(raw)
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, out)
  console.log(`✔ ${inFile} → ${outFile}`)
}

const args = process.argv.slice(2)
if (args[0] === '--dir') {
  const [_, inDir, outDir] = args
  if (!inDir || !outDir) { console.error('Uso: --dir <in> <out>'); process.exit(1) }
  const walk = (d) =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : e.name.toLowerCase().endsWith('.html') ? [path.join(d, e.name)] : [],
    )
  for (const f of walk(inDir)) {
    processFile(f, path.join(outDir, path.relative(inDir, f)))
  }
} else {
  const [inFile, outFile] = args
  if (!inFile || !outFile) { console.error('Uso: <entrada.html> <salida.html>'); process.exit(1) }
  processFile(inFile, outFile)
}
