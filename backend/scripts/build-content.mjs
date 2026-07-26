#!/usr/bin/env node
/**
 * Genera content/index.json a partir de los HTML ya estandarizados que viven
 * en content/beginner/. NO modifica los HTML: cada archivo cumple el estándar
 * en su propio código (ver content/ESTANDAR-HTML.md). content-raw/ es el
 * respaldo íntegro de la descarga del Drive, para poder diffear.
 *
 * Estructura esperada:
 *   content/beginner/u<N>-m<NN>/{lesson,guide,extra}.html
 *   content/beginner/u<N>-checkpoint/checkpoint.html
 *
 * Uso: node scripts/build-content.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(here, '..')
const BEGINNER = path.join(ROOT, 'content', 'beginner')

/** Primer encabezado con contenido real (fallback cuando el <title> es basura). */
const headingOf = (html) => {
  const heads = [...html.matchAll(/<h[12][^>]*>([^<]{3,70})</gi)].map((x) => x[1].trim())
  const good = heads.find((h) => !/^(module|lesson|unit|basic|freakn)\b[\s\d.|-]*$/i.test(h))
  if (!good) return null
  return good === good.toUpperCase()
    ? good.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : good
}

const titleOf = (file) => {
  const html = fs.readFileSync(file, 'utf8')
  const m = html.match(/<title>([^<]*)/i)
  if (!m) return headingOf(html)

  let t = m[1]
    .replace(/Freakn'?s?\s*(Lesson|Guide|Activity|Checkpoint)?\s*:?\s*/i, '')
    .replace(/FLG\s*[\d.]*\s*[-–—]?\s*/i, '')
    .replace(/\((A1|A2|B1|B2)[^)]*\)/i, '')
    .replace(/\((Layout|Fixed|Final|Draft|Updated|Revised)[^)]*\)/i, '')

  // "Unit 5 Module 21 | The Suspect" → "The Suspect" (descarta numeración).
  const isNumbering = (s) => /^(module|lesson|unit|basic)\b[\s\d.|-]*$/i.test(s.trim())
  const segs = t.split('|').map((s) => s.trim()).filter(Boolean)
  if (segs.length > 1) {
    t = [...segs].reverse().find((s) => !isNumbering(s)) ?? segs[segs.length - 1]
  }

  t = t
    .replace(/\b(Module|Lesson|Unit)\s*\d+\s*[:–—-]\s*/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s:–—|-]+|[\s:–—|-]+$/g, '')
    .trim()

  if (!t || isNumbering(t)) return headingOf(html)
  return t
}

if (!fs.existsSync(BEGINNER)) {
  console.error('No existe content/beginner/ — nada que indexar')
  process.exit(1)
}

const PARTS = [
  ['lesson.html', 'Lección interactiva', 45],
  ['extra.html', 'Actividad extra', 20],
  ['guide.html', 'Guía de estudio', 15],
]

const modules = []
const dirs = fs.readdirSync(BEGINNER).filter((d) => /^u\d+-(m\d+|checkpoint)$/.test(d))

for (const dir of dirs) {
  const unit = Number(dir.match(/^u(\d+)/)[1])
  const dirPath = path.join(BEGINNER, dir)
  const isCheckpoint = dir.endsWith('checkpoint')

  if (isCheckpoint) {
    const file = path.join(dirPath, 'checkpoint.html')
    if (!fs.existsSync(file)) continue
    modules.push({
      id: `beg-${dir}`,
      level: 'beginner',
      unit,
      // Los checkpoints cierran la unidad: van después de todos sus módulos.
      order: unit * 100 + 99,
      title: `Checkpoint · Unidad ${unit}`,
      description: `Repaso evaluado de la unidad ${unit}. Tus respuestas quedan registradas para tu profe.`,
      lessons: [{
        id: `beg-${dir}-quiz`,
        title: 'Checkpoint de la unidad',
        position: 1,
        durationMin: 30,
        kind: 'html',
        // Compuerta: bloquea todo lo que sigue hasta que el estudiante lo
        // supere, y no se abre hasta que su profe lo habilite. Va en el
        // manifiesto (no en una migración) para que se aplique en cada boot,
        // también en producción, que usa `prisma db push` sin correr SQL.
        isCheckpoint: true,
        file: `beginner/${dir}/checkpoint.html`,
      }],
    })
    continue
  }

  const modN = Number(dir.match(/-m(\d+)$/)[1])
  const lessons = []
  for (const [file, label, dur] of PARTS) {
    if (!fs.existsSync(path.join(dirPath, file))) continue
    lessons.push({
      id: `beg-${dir}-${file.replace('.html', '')}`,
      title: label,
      position: lessons.length + 1,
      durationMin: dur,
      kind: 'html',
      file: `beginner/${dir}/${file}`,
    })
  }
  if (lessons.length === 0) continue

  const lessonFile = path.join(dirPath, 'lesson.html')
  const topic = fs.existsSync(lessonFile) ? titleOf(lessonFile) : null
  modules.push({
    id: `beg-${dir}`,
    level: 'beginner',
    unit,
    order: unit * 100 + modN,
    title: `Módulo ${modN} · ${topic ?? `Unidad ${unit}`}`,
    description: `Unidad ${unit} del programa beginner.`,
    lessons,
  })
}

modules.sort((a, b) => a.order - b.order)
modules.forEach((m, i) => {
  m.position = i + 1
  delete m.order
})

const manifest = {
  $comment:
    'GENERADO por scripts/build-content.mjs desde content/beginner/. Los HTML se editan a mano siguiendo content/ESTANDAR-HTML.md; este script solo indexa.',
  modules,
}
fs.writeFileSync(path.join(ROOT, 'content', 'index.json'), JSON.stringify(manifest, null, 2))
const units = [...new Set(modules.map((m) => m.unit))].sort((a, b) => a - b)
console.log(
  `OK: ${modules.length} módulos en ${units.length} unidades, ` +
    `${modules.reduce((s, m) => s + m.lessons.length, 0)} lecciones → content/index.json`,
)
