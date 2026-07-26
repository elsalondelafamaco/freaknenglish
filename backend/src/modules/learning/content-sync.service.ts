import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { PrismaService } from '../../prisma/prisma.service'

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
          file: string
        }>
      }>
    }

    let modules = 0
    let lessons = 0
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
        const data = {
          moduleId: m.id,
          title: l.title,
          position: l.position,
          durationMin: l.durationMin ?? 25,
          kind: l.kind ?? 'html',
          contentHtml,
        }
        await this.prisma.lesson.upsert({
          where: { id: l.id },
          update: data,
          create: { id: l.id, ...data },
        })
        lessons++
      }
    }
    this.log.log(`content sync OK: ${modules} módulo(s), ${lessons} lección(es)`)
    return { modules, lessons }
  }
}
