import { Controller, Get } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * Instante en que arrancó ESTE proceso. Se calcula una sola vez al cargar el
 * módulo, así que sobrevive a cualquier request y cambia únicamente cuando
 * Railway levanta un contenedor nuevo — es decir, en cada despliegue.
 */
const STARTED_AT = new Date()

/** SHA corto: identifica el commit sin exponer el mensaje ni el autor. */
const COMMIT = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null
const BRANCH = process.env.RAILWAY_GIT_BRANCH ?? null

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  /**
   * @endpoint GET /api/v1/health
   *
   * Además del `ok` que consulta Railway como healthcheck, devuelve qué
   * versión está corriendo. Sin esto, saber si un cambio ya llegó a producción
   * obligaba a inventar sondas indirectas —pedir un endpoint nuevo y mirar si
   * daba 404 o 401, comparar hashes de assets— y un cambio que solo tocaba
   * lógica de backend era directamente imposible de verificar.
   *
   * `commit` y `branch` los inyecta Railway cuando el servicio está conectado
   * al repo; si faltan quedan en null y `startedAt` sigue sirviendo, porque
   * cambia con cada despliegue.
   */
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`
    return {
      ok: true,
      time: new Date().toISOString(),
      commit: COMMIT,
      branch: BRANCH,
      startedAt: STARTED_AT.toISOString(),
      uptimeSec: Math.round((Date.now() - STARTED_AT.getTime()) / 1000),
    }
  }
}
