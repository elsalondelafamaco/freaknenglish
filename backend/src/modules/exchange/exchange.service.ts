import { Injectable, Logger } from '@nestjs/common'
import * as crypto from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * TRM (Tasa Representativa del Mercado, COP/USD).
 *
 * Source: Superintendencia Financiera vía SODA de datos.gov.co
 *   https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC
 *
 * Cache: se persiste en `trm_rates`; si la última fila tiene < 12 h se
 * reutiliza sin llamar al SODA.
 */
@Injectable()
export class ExchangeService {
  private readonly log = new Logger(ExchangeService.name)
  private static readonly SODA_URL =
    'https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC'
  private static readonly TTL_MS = 12 * 60 * 60 * 1000

  constructor(private prisma: PrismaService) {}

  async getCurrentTrm(): Promise<{ valueCop: number; validFrom: string; source: string }> {
    const latest = await this.prisma.trmRate.findFirst({ orderBy: { fetchedAt: 'desc' } })
    const fresh = latest && Date.now() - latest.fetchedAt.getTime() < ExchangeService.TTL_MS
    if (fresh) {
      return {
        valueCop: Number(latest.valueCop),
        validFrom: latest.validFrom.toISOString(),
        source: latest.source,
      }
    }
    try {
      const res = await fetch(ExchangeService.SODA_URL, { headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`SODA responded ${res.status}`)
      const rows = (await res.json()) as Array<{ valor: string; vigenciadesde: string }>
      const row = rows[0]
      if (!row) throw new Error('SODA empty response')
      const valueCop = Number(row.valor)
      const validFrom = new Date(row.vigenciadesde)
      const saved = await this.prisma.trmRate.upsert({
        where: { id: crypto.createHash('sha1').update(`${validFrom.toISOString()}`).digest('hex') },
        update: { valueCop, fetchedAt: new Date() },
        create: {
          id: crypto.createHash('sha1').update(`${validFrom.toISOString()}`).digest('hex'),
          validFrom,
          valueCop,
          source: 'superfinanciera',
        },
      })
      return {
        valueCop: Number(saved.valueCop),
        validFrom: saved.validFrom.toISOString(),
        source: saved.source,
      }
    } catch (err) {
      this.log.warn(`TRM fetch failed: ${(err as Error).message}. Falling back to cache.`)
      if (latest) {
        return {
          valueCop: Number(latest.valueCop),
          validFrom: latest.validFrom.toISOString(),
          source: latest.source,
        }
      }
      // Hard fallback so the API never throws for a marketing widget.
      return { valueCop: 4000, validFrom: new Date().toISOString(), source: 'fallback' }
    }
  }
}