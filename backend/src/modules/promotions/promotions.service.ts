import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { Promotion } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { Atribucion, cumpleAtribucion, estaVigente, mejorPromo, PlanPrecio, PrecioPromo } from './promo-precio'

export type EstadoPromo = 'activa' | 'programada' | 'vencida' | 'pausada' | 'agotada'

export interface DatosPromo {
  name?: string
  isActive?: boolean
  priority?: number
  startsAt?: string | null
  endsAt?: string | null
  discountType?: string
  discountValue?: number
  planIds?: string[]
  appliesToNew?: boolean
  appliesToRenewals?: boolean
  audience?: string
  code?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  showBanner?: boolean
  showOnPrices?: boolean
  bannerText?: string | null
  badgeText?: string | null
  checkoutLabel?: string | null
  bgColor?: string
  textColor?: string
  showCountdown?: boolean
  maxRedemptions?: number | null
}

const HEX = /^#[0-9a-fA-F]{6}$/
const CODIGO = /^[A-Za-z0-9_-]{2,40}$/
/** Caché corta de las promos públicas: la web las pide en cada visita. */
const CACHE_MS = 30_000

/** Texto opcional: vacío o solo espacios cuenta como "sin valor". */
const limpio = (s: string | null | undefined) => {
  const t = s?.trim()
  return t ? t : null
}

@Injectable()
export class PromotionsService {
  private cache: { en: number; filas: Array<Promotion & { usos: number }> } | null = null

  constructor(private prisma: PrismaService) {}

  /** Usos de cada promo = pagos APROBADOS que la llevan. */
  private async usosPorPromo(): Promise<Map<string, number>> {
    const g = await this.prisma.paymentIntent.groupBy({
      by: ['promotionId'],
      where: { status: 'APPROVED', promotionId: { not: null } },
      _count: { _all: true },
    })
    return new Map(g.map((x) => [x.promotionId as string, x._count._all]))
  }

  private estado(p: Promotion, usos: number, ahora: Date): EstadoPromo {
    if (!p.isActive) return 'pausada'
    if (p.endsAt && p.endsAt.getTime() <= ahora.getTime()) return 'vencida'
    if (p.startsAt && p.startsAt.getTime() > ahora.getTime()) return 'programada'
    if (p.maxRedemptions !== null && usos >= p.maxRedemptions) return 'agotada'
    return 'activa'
  }

  async listar() {
    const [filas, usos] = await Promise.all([
      this.prisma.promotion.findMany({ orderBy: [{ createdAt: 'desc' }] }),
      this.usosPorPromo(),
    ])
    const ahora = new Date()
    return filas.map((p) => {
      const redemptions = usos.get(p.id) ?? 0
      return { ...p, redemptions, estado: this.estado(p, redemptions, ahora) }
    })
  }

  /** Valida y normaliza. Recibe el resultado ya mezclado (crear o actualizar). */
  private validar(d: DatosPromo, otras: Promotion[], idActual?: string) {
    const name = limpio(d.name)
    if (!name) throw new BadRequestException('Ponle un nombre interno a la promoción')
    if (d.discountType !== 'PERCENT' && d.discountType !== 'USD' && d.discountType !== 'COP') {
      throw new BadRequestException('Tipo de descuento inválido')
    }
    const v = d.discountValue
    if (!Number.isInteger(v) || (v as number) <= 0) throw new BadRequestException('El descuento debe ser un número positivo')
    if (d.discountType === 'PERCENT' && ((v as number) < 1 || (v as number) > 90)) {
      throw new BadRequestException('El porcentaje debe estar entre 1 y 90')
    }
    const startsAt = d.startsAt ? new Date(d.startsAt) : null
    const endsAt = d.endsAt ? new Date(d.endsAt) : null
    if ((startsAt && isNaN(startsAt.getTime())) || (endsAt && isNaN(endsAt.getTime()))) {
      throw new BadRequestException('Fecha inválida')
    }
    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('La fecha de fin debe ser posterior a la de inicio')
    }
    const bgColor = d.bgColor ?? '#EBD81A'
    const textColor = d.textColor ?? '#111111'
    if (!HEX.test(bgColor) || !HEX.test(textColor)) throw new BadRequestException('Los colores deben ser hex de 6 dígitos, p. ej. #EBD81A')

    const audience = d.audience ?? 'ALL'
    if (audience !== 'ALL' && audience !== 'LINK') throw new BadRequestException('Audiencia inválida')
    const code = limpio(d.code)
    const utmSource = limpio(d.utmSource)
    const utmMedium = limpio(d.utmMedium)
    const utmCampaign = limpio(d.utmCampaign)
    if (code && !CODIGO.test(code)) {
      throw new BadRequestException('El código solo admite letras, números, guion y guion bajo (2 a 40 caracteres)')
    }
    if (audience === 'LINK' && !code && !utmSource && !utmMedium && !utmCampaign) {
      throw new BadRequestException('Para "Solo con enlace" define un código o al menos un parámetro UTM')
    }
    // El código identifica la campaña: dos promos con el mismo no se podrían distinguir.
    if (audience === 'LINK' && code && otras.some((o) => o.id !== idActual && o.code && o.code.toLowerCase() === code.toLowerCase())) {
      throw new BadRequestException('Ya existe otra promoción con ese código')
    }
    const max = d.maxRedemptions ?? null
    if (max !== null && (!Number.isInteger(max) || max < 1)) throw new BadRequestException('El límite de usos debe ser 1 o más')
    const priority = d.priority ?? 0
    if (!Number.isInteger(priority)) throw new BadRequestException('Prioridad inválida')

    return {
      name,
      isActive: d.isActive ?? true,
      priority,
      startsAt,
      endsAt,
      discountType: d.discountType,
      discountValue: v as number,
      planIds: [...new Set(d.planIds ?? [])],
      appliesToNew: d.appliesToNew ?? true,
      appliesToRenewals: d.appliesToRenewals ?? false,
      audience,
      // Con audiencia "todos" no se guardan los datos del enlace: no significan nada.
      code: audience === 'LINK' ? code : null,
      utmSource: audience === 'LINK' ? utmSource : null,
      utmMedium: audience === 'LINK' ? utmMedium : null,
      utmCampaign: audience === 'LINK' ? utmCampaign : null,
      showBanner: d.showBanner ?? false,
      showOnPrices: d.showOnPrices ?? false,
      bannerText: limpio(d.bannerText),
      badgeText: limpio(d.badgeText),
      checkoutLabel: limpio(d.checkoutLabel),
      bgColor,
      textColor,
      showCountdown: d.showCountdown ?? false,
      maxRedemptions: max,
    }
  }

  async crear(dto: DatosPromo) {
    const otras = await this.prisma.promotion.findMany()
    const data = this.validar(dto, otras)
    const p = await this.prisma.promotion.create({ data })
    this.cache = null
    return p
  }

  async actualizar(id: string, dto: DatosPromo) {
    const actual = await this.prisma.promotion.findUnique({ where: { id } })
    if (!actual) throw new NotFoundException('Promoción no encontrada')
    const otras = await this.prisma.promotion.findMany()
    // Se mezcla con lo guardado y se valida el resultado completo: una edición
    // parcial (p. ej. pausar) no puede dejar la promo en un estado inválido.
    const mezcla: DatosPromo = {
      ...actual,
      startsAt: actual.startsAt?.toISOString() ?? null,
      endsAt: actual.endsAt?.toISOString() ?? null,
      ...dto,
    }
    const data = this.validar(mezcla, otras, id)
    const p = await this.prisma.promotion.update({ where: { id }, data })
    this.cache = null
    return p
  }

  async borrar(id: string) {
    const actual = await this.prisma.promotion.findUnique({ where: { id } })
    if (!actual) throw new NotFoundException('Promoción no encontrada')
    // Los intentos ya pagados conservan su descuento: promotionId pasa a null.
    await this.prisma.promotion.delete({ where: { id } })
    this.cache = null
    return { ok: true }
  }

  /** Promos vigentes ahora (con usos disponibles), con caché corta. */
  private async vigentes() {
    const ahora = Date.now()
    if (!this.cache || ahora - this.cache.en >= CACHE_MS) {
      const [filas, usos] = await Promise.all([
        this.prisma.promotion.findMany({ where: { isActive: true } }),
        this.usosPorPromo(),
      ])
      this.cache = { en: ahora, filas: filas.map((p) => ({ ...p, usos: usos.get(p.id) ?? 0 })) }
    }
    // La caché guarda las candidatas; la vigencia por fecha se re-evalúa cada vez.
    return this.cache.filas.filter((p) => estaVigente(p, new Date(), p.usos))
  }

  /** Lo que el sitio puede ver: nada interno (nombre, límites, conteos). */
  async publicas(atr: Atribucion) {
    const vigentes = await this.vigentes()
    return vigentes
      .filter((p) => cumpleAtribucion(p, atr))
      .map((p) => ({
        id: p.id,
        discountType: p.discountType,
        discountValue: p.discountValue,
        planIds: p.planIds,
        appliesToNew: p.appliesToNew,
        appliesToRenewals: p.appliesToRenewals,
        showBanner: p.showBanner,
        showOnPrices: p.showOnPrices,
        bannerText: p.bannerText,
        badgeText: p.badgeText,
        checkoutLabel: p.checkoutLabel,
        bgColor: p.bgColor,
        textColor: p.textColor,
        showCountdown: p.showCountdown,
        endsAt: p.endsAt,
        // Para que el sitio desempate igual que el servidor.
        priority: p.priority,
        createdAt: p.createdAt,
      }))
  }

  /**
   * La promo que se cobra: se consulta SIN caché porque aquí se decide dinero
   * (un tope de usos ya agotado no puede seguir aplicándose por una caché vieja).
   */
  async elegirParaCobro(
    plan: PlanPrecio & { id: string },
    trmCop: number,
    esRenovacion: boolean,
    atr: Atribucion | null,
  ): Promise<{ promo: Promotion; precio: PrecioPromo } | null> {
    const [filas, usos] = await Promise.all([
      this.prisma.promotion.findMany({ where: { isActive: true } }),
      this.usosPorPromo(),
    ])
    const ahora = new Date()
    const vigentes = filas.filter((p) => estaVigente(p, ahora, usos.get(p.id) ?? 0))
    return mejorPromo(vigentes, plan, trmCop, esRenovacion, atr)
  }
}
