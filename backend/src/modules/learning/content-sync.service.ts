import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import { PrismaService } from '../../prisma/prisma.service'

/** Huella del HTML de una lección; la misma que se guarda en `contentSourceHash`. */
export const hashDeContenido = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const hashDe = hashDeContenido

/**
 * Slides de una lección, en orden. Se queda con el `id` cuando lo tiene (hay
 * lecciones que navegan por id, como "slide-game") y con la posición cuando no.
 * Es el denominador de la barra de progreso y el que traduce una posición
 * guardada a un porcentaje.
 *
 * Hay dos convenciones en el contenido, y lo que importa es contar las MISMAS
 * etiquetas que cuenta la propia lección con su `querySelectorAll`:
 *
 * - Cada slide con `class="slide"` y todo envuelto en un `class="slide-container"`.
 *   Ahí el contenedor NO es un slide: contarlo inflaba el denominador en uno, y
 *   el último slide se quedaba en 7/8 = 88% sin poder llegar nunca al 100%.
 * - `class="slide-container"` como el slide en sí, sin ningún `class="slide"`
 *   suelto.
 *
 * Por eso se prefiere la clase exacta `slide` cuando existe, y solo si no hay
 * ninguna se cae a las variantes con guion, que es lo que se hacía siempre.
 */
function leerSlides(html: string): { total: number; refs: string[] } {
  const etiquetas = [...html.matchAll(/<[a-zA-Z][^>]*\bclass\s*=\s*"([^"]*)"[^>]*>/g)]
  const exactas = etiquetas.filter((t) => t[1].split(/\s+/).includes('slide'))
  const elegidas = exactas.length > 0 ? exactas : etiquetas.filter((t) => /\bslide\b/.test(t[1]))
  const refs = elegidas.map((t, i) => /\bid\s*=\s*"([^"]+)"/.exec(t[0])?.[1] ?? String(i))
  return { total: refs.length, refs }
}

/** Slides de una lección tal como se sirve; `null` si no tiene HTML. */
export const slidesDeHtml = (html: string | null | undefined) =>
  html ? leerSlides(html) : null

/**
 * Sincroniza el contenido versionado del repo (backend/content) con la DB al
 * arrancar. Con esto, hacer push del contenido lo deja cargado en productivo
 * sin pasos manuales: Railway arranca → upsert idempotente por ids estables.
 *
 * Fuente: content/index.json (ver content/README.md). El HTML de cada lección
 * se guarda en Lesson.contentHtml (el viewer lo monta en un iframe con el
 * bridge FreaknActivity para reportar resultados).
 */
@Injectable()
export class ContentSyncService implements OnModuleInit {
  private readonly log = new Logger(ContentSyncService.name)
  constructor(private prisma: PrismaService) {}

  /** Busca la carpeta content en dev (cwd) y en el build de Railway. */
  private contentDir(): string | null {
    const candidates = [
      path.join(process.cwd(), 'content'),
      path.join(process.cwd(), 'backend', 'content'),
      path.join(__dirname, '..', '..', '..', 'content'),
    ]
    for (const c of candidates) {
      if (fs.existsSync(path.join(c, 'index.json'))) return c
    }
    return null
  }

  async onModuleInit() {
    try {
      await this.sync()
    } catch (e) {
      // El contenido no debe tumbar el boot: se loguea y la app sigue.
      this.log.error(`content sync falló: ${(e as Error).message}`)
    }
  }

  async sync() {
    const dir = this.contentDir()
    if (!dir) {
      // En producción esto significa que la imagen se armó sin `COPY content`:
      // la plataforma arranca SIN contenido. Se grita para que se note en logs.
      this.log.error(
        'NO se encontró content/index.json — la plataforma arranca SIN contenido de aprendizaje. ' +
          `Revisa que el Dockerfile copie la carpeta content/ (cwd=${process.cwd()}).`,
      )
      return { modules: 0, lessons: 0 }
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as {
      modules: Array<{
        id: string
        level: 'beginner' | 'intermediate' | 'advanced'
        title: string
        description?: string
        position: number
        unit?: number
        lessons: Array<{
          id: string
          title: string
          position: number
          durationMin?: number
          kind?: string
          isCheckpoint?: boolean
          file: string
        }>
      }>
    }

    let modules = 0
    let lessons = 0
    const preservadas: string[] = []
    for (const m of manifest.modules ?? []) {
      const modData = {
        title: m.title,
        description: m.description,
        level: m.level,
        position: m.position,
        unit: m.unit ?? null,
      }
      await this.prisma.module.upsert({
        where: { id: m.id },
        update: modData,
        create: { id: m.id, ...modData },
      })
      modules++
      for (const l of m.lessons ?? []) {
        const file = path.join(dir, l.file)
        if (!fs.existsSync(file)) {
          this.log.warn(`lección ${l.id}: archivo no encontrado ${l.file} — omitida`)
          continue
        }
        const contentHtml = fs.readFileSync(file, 'utf8')
        const hashArchivo = hashDe(contentHtml)
        const slides = leerSlides(contentHtml)
        // Metadatos: siempre se sincronizan desde el manifiesto, editada o no.
        const meta = {
          moduleId: m.id,
          title: l.title,
          position: l.position,
          durationMin: l.durationMin ?? 25,
          kind: l.kind ?? 'html',
          isCheckpoint: l.isCheckpoint ?? false,
          slideCount: slides.total,
          slideRefs: slides.refs as any,
        }

        const previa = await this.prisma.lesson.findUnique({
          where: { id: l.id },
          select: { contentHtml: true, contentSourceHash: true },
        })

        if (!previa) {
          await this.prisma.lesson.create({
            data: { id: l.id, ...meta, contentHtml, contentSourceHash: hashArchivo },
          })
          lessons++
          continue
        }

        // ¿La tocaron desde el CMS? Se compara lo que hay en la base contra el
        // hash del archivo con el que se sincronizó la última vez.
        //
        // Cuando no hay hash guardado (primera vez tras añadir la columna) se
        // compara el contenido directamente: si difiere del archivo, es una
        // lección editada en plataforma y hay que conservarla. Este es el caso
        // que rescata lo que se editó antes de existir esta protección.
        const hashEnBase = hashDe(previa.contentHtml ?? '')
        const editadaEnPlataforma = previa.contentSourceHash
          ? hashEnBase !== previa.contentSourceHash
          : hashEnBase !== hashArchivo

        if (editadaEnPlataforma) {
          // Se respeta el contenido de la base y se deja constancia de que
          // diverge, para que el CMS lo pueda mostrar y no sorprenda a nadie.
          // Los slides se cuentan sobre ESE html —el que se sirve— y no sobre el
          // del repositorio: si le añadieron o quitaron slides en plataforma, el
          // denominador de la barra tiene que seguirlos.
          const suyos = leerSlides(previa.contentHtml ?? '')
          await this.prisma.lesson.update({
            where: { id: l.id },
            data: { ...meta, slideCount: suyos.total, slideRefs: suyos.refs as any },
          })
          preservadas.push(l.id)
        } else {
          await this.prisma.lesson.update({
            where: { id: l.id },
            data: { ...meta, contentHtml, contentSourceHash: hashArchivo },
          })
        }
        lessons++
      }
    }
    const recontadas = await this.recontarSlides()
    this.log.log(`content sync OK: ${modules} módulo(s), ${lessons} lección(es)`)
    if (recontadas > 0) this.log.warn(`${recontadas} lección(es) con el conteo de slides corregido`)
    if (preservadas.length > 0) {
      this.log.warn(
        `${preservadas.length} lección(es) editada(s) desde el CMS: se conservó la versión de la ` +
          `plataforma y NO se pisó con la del repositorio → ${preservadas.join(', ')}`,
      )
    }
    return { modules, lessons, preservadas, recontadas }
  }

  /**
   * Pone al día `slideCount`/`slideRefs` de cualquier lección cuyo conteo no
   * coincida con su propio HTML. Hace falta porque las lecciones creadas desde
   * el CMS no pasan por el manifiesto —los niveles intermedio y avanzado se
   * cargaron así— y porque un cambio en cómo se cuentan los slides tiene que
   * alcanzar también a las que ya estaban guardadas. Solo toca esas dos
   * columnas: el contenido no se mueve.
   */
  private async recontarSlides(): Promise<number> {
    const lecciones = await this.prisma.lesson.findMany({
      select: { id: true, contentHtml: true, slideCount: true, slideRefs: true },
    })
    let corregidas = 0
    for (const l of lecciones) {
      const slides = slidesDeHtml(l.contentHtml)
      if (!slides) continue
      const guardadas = Array.isArray(l.slideRefs) ? (l.slideRefs as string[]) : []
      if (slides.total === l.slideCount && slides.refs.join('|') === guardadas.join('|')) continue
      await this.prisma.lesson.update({
        where: { id: l.id },
        data: { slideCount: slides.total, slideRefs: slides.refs as any },
      })
      corregidas++
    }
    return corregidas
  }
}
