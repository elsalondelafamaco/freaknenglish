#!/usr/bin/env node
/**
 * Construye content/ (versionado, seed automático) a partir de content-raw/
 * (descarga cruda del Drive):
 *
 *   content-raw/unit-N/module-NN/{lesson,guide,extra}.html
 *   content-raw/unit-N/checkpoint.html
 *        │  process (viewport + freakn-standard: responsive + bridge + auto-wiring)
 *        ▼
 *   content/beginner/uN-mNN/{lesson,guide,extra}.html
 *   content/beginner/uN-checkpoint/checkpoint.html
 *   content/index.json  (módulos + lecciones para ContentSyncService)
 *
 * Uso: node scripts/build-content.mjs
 * Idempotente: regenera content/beginner e index.json completos.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(here, '..')
const RAW = path.join(ROOT, 'content-raw')
const OUT = path.join(ROOT, 'content')
const SHARED = fs.readFileSync(path.join(OUT, '_shared', 'freakn-standard.html'), 'utf8')

function processHtml(raw) {
  let html = raw
  if (!/name=["']viewport["']/i.test(html)) {
    const meta = '<meta name="viewport" content="width=device-width, initial-scale=1">'
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}\n${meta}`) : `${meta}\n${html}`
  }
  if (!html.includes('id="freakn-bridge"')) {
    if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${SHARED}\n</head>`)
    else if (/<body[^>]*>/i.test(html)) html = html.replace(/<body[^>]*>/i, (m) => `${m}\n${SHARED}`)
    else html = `${SHARED}\n${html}`
  }
  return html
}

const titleOf = (file) => {
  const m = fs.readFileSync(file, 'utf8').match(/<title>([^<]*)/i)
  if (!m) return null
  // "Freakn' Lesson: Breaking the Ice (A1 Edition)" → "Breaking the Ice"
  return m[1]
    .replace(/Freakn'?s? (Lesson|Guide|Activity|Checkpoint)\s*:?\s*/i, '')
    .replace(/\((A1|A2|B1|B2)[^)]*\)/i, '')
    .replace(/\s+/g, ' ')
    .trim() || null
}

if (!fs.existsSync(RAW)) {
  console.error('No existe content-raw/ — nada que construir')
  process.exit(1)
}

// Limpia el output anterior de beginner (regeneración completa).
const outBeginner = path.join(OUT, 'beginner')
fs.rmSync(outBeginner, { recursive: true, force: true })

const modules = []
const units = fs.readdirSync(RAW).filter((d) => /^unit-\d+$/.test(d)).sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]))

for (const unitDir of units) {
  const unitN = Number(unitDir.split('-')[1])
  const unitPath = path.join(RAW, unitDir)
  const moduleDirs = fs.readdirSync(unitPath).filter((d) => /^module-\d+$/.test(d)).sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]))

  for (const modDir of moduleDirs) {
    const modN = Number(modDir.split('-')[1])
    const modPath = path.join(unitPath, modDir)
    const slug = `u${unitN}-m${String(modN).padStart(2, '0')}`
    const lessons = []

    const parts = [
      ['lesson.html', 'Lección interactiva', 45],
      ['extra.html', 'Actividad extra', 20],
      ['guide.html', 'Guía de estudio', 15],
    ]
    for (const [file, label, dur] of parts) {
      const src = path.join(modPath, file)
      if (!fs.existsSync(src)) continue
      const rel = path.join('beginner', slug, file)
      const dst = path.join(OUT, rel)
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      fs.writeFileSync(dst, processHtml(fs.readFileSync(src, 'utf8')))
      lessons.push({
        id: `beg-${slug}-${file.replace('.html', '')}`,
        title: label,
        position: lessons.length + 1,
        durationMin: dur,
        kind: 'html',
        file: rel.replaceAll(path.sep, '/'),
      })
    }
    if (lessons.length === 0) continue

    const lessonTitle = fs.existsSync(path.join(modPath, 'lesson.html')) ? titleOf(path.join(modPath, 'lesson.html')) : null
    modules.push({
      id: `beg-${slug}`,
      level: 'beginner',
      title: `Módulo ${modN} · ${lessonTitle ?? `Unidad ${unitN}`}`,
      description: `Unidad ${unitN} del programa beginner.`,
      position: modN,
      lessons,
    })
  }

  // Checkpoint de la unidad como módulo propio al final de la unidad.
  const cp = path.join(unitPath, 'checkpoint.html')
  if (fs.existsSync(cp)) {
    const slug = `u${unitN}-checkpoint`
    const rel = path.join('beginner', slug, 'checkpoint.html')
    const dst = path.join(OUT, rel)
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.writeFileSync(dst, processHtml(fs.readFileSync(cp, 'utf8')))
    modules.push({
      id: `beg-${slug}`,
      level: 'beginner',
      title: `Unidad ${unitN} · Checkpoint`,
      description: `Repaso evaluado de la unidad ${unitN}. Tus resultados quedan registrados para tu profe.`,
      // Después del último módulo de la unidad (los módulos van 1..40 → checkpoints en .5)
      position: unitN * 5 + 0.5,
      lessons: [
        {
          id: `beg-${slug}-quiz`,
          title: 'Checkpoint de la unidad',
          position: 1,
          durationMin: 30,
          kind: 'html',
          file: rel.replaceAll(path.sep, '/'),
        },
      ],
    })
  }
}

// Posiciones finales: orden estable, enteros.
modules.sort((a, b) => a.position - b.position)
modules.forEach((m, i) => { m.position = i + 1 })

const manifest = {
  $comment: 'GENERADO por scripts/build-content.mjs a partir de content-raw/ (Drive beginner). No editar a mano.',
  modules,
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(manifest, null, 2))
console.log(`OK: ${modules.length} módulos, ${modules.reduce((s, m) => s + m.lessons.length, 0)} lecciones → content/index.json`)
