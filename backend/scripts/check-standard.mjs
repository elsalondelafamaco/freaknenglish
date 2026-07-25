#!/usr/bin/env node
/** Valida que los HTML de content/beginner cumplan content/ESTANDAR-HTML.md. */
import fs from 'node:fs'
import path from 'node:path'
const BASE = 'content/beginner'
const rows = []
for (const dir of fs.readdirSync(BASE)) {
  for (const f of fs.readdirSync(path.join(BASE, dir))) {
    if (!f.endsWith('.html')) continue
    const h = fs.readFileSync(path.join(BASE, dir, f), 'utf8')
    let jsOk = true
    for (const m of h.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)) {
      try { new Function(m[1]) } catch { jsOk = false }
    }
    rows.push({
      file: `${dir}/${f}`,
      viewport: /name=["']viewport/.test(h),
      bridge: (h.match(/source:\s*["']freakn-lesson/g) || []).length,
      media: /max-width:\s*820px/.test(h),
      calls: (h.match(/FreaknActivity\.(submit|complete)/g) || []).length,
      jsOk,
    })
  }
}
const bad = rows.filter((r) => !r.viewport || r.bridge !== 1 || !r.media || r.calls < 1 || !r.jsOk)
console.log(`total ${rows.length} | OK ${rows.length - bad.length} | pendientes ${bad.length}`)
for (const b of bad) console.log(' -', b.file, JSON.stringify(b).replace(/"file":"[^"]*",/, ''))
