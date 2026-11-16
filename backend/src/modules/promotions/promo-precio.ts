/**
 * Precio con promoción. Función pura y SIN dependencias: el storefront tiene una
 * copia idéntica (`storefront/src/lib/domain/promos.ts`) para que lo que se
 * muestra sea exactamente lo que se cobra. Si cambias una, cambia la otra.
 */

export type TipoDescuento = 'PERCENT' | 'USD' | 'COP'

/** Wompi no cobra montos muy bajos: ninguna promo deja el plan por debajo. */
export const COP_MINIMO = 5000

export interface PlanPrecio {
  priceCop: number
  priceUsd: number | null
}

export interface DescuentoPromo {
  discountType: string
  discountValue: number
}

export interface PrecioPromo {
  /** Precio de lista en COP, antes del descuento. */
  listaCop: number
  /** Lo que se cobra en COP. */
  finalCop: number
  descuentoCop: number
  /** USD de lista (null si el plan no tiene precio en USD). */
  listaUsd: number | null
  /** USD con descuento para mostrar; null si el descuento es en COP. */
  finalUsd: number | null
}

/** Precio de lista en COP: USD × TRM si el plan tiene USD, y si no el fijo en COP. */
export function precioListaCop(plan: PlanPrecio, trmCop: number): number {
  return plan.priceUsd && plan.priceUsd > 0 && trmCop > 0 ? Math.round(plan.priceUsd * trmCop) : plan.priceCop
}

export function precioConPromo(plan: PlanPrecio, trmCop: number, promo: DescuentoPromo | null): PrecioPromo {
  const listaCop = precioListaCop(plan, trmCop)
  const tieneUsd = !!plan.priceUsd && plan.priceUsd > 0 && trmCop > 0
  const listaUsd = plan.priceUsd && plan.priceUsd > 0 ? plan.priceUsd : null
  if (!promo) return { listaCop, finalCop: listaCop, descuentoCop: 0, listaUsd, finalUsd: listaUsd }

  const v = promo.discountValue
  let cop = listaCop
  let finalUsd: number | null = listaUsd
  if (promo.discountType === 'PERCENT') {
    cop = Math.round((listaCop * (100 - v)) / 100)
    finalUsd = listaUsd === null ? null : Math.round(listaUsd * (100 - v)) / 100
  } else if (promo.discountType === 'USD') {
    if (tieneUsd) {
      finalUsd = Math.max((plan.priceUsd as number) - v, 0)
      cop = Math.round(finalUsd * trmCop)
    } else {
      cop = listaCop - Math.round(v * trmCop)
      finalUsd = null
    }
  } else if (promo.discountType === 'COP') {
    cop = listaCop - v
    finalUsd = null
  }
  // Nunca por debajo del mínimo, y nunca más caro que la lista (si la lista ya
  // es menor al mínimo, simplemente no hay descuento).
  const finalCop = Math.min(listaCop, Math.max(cop, COP_MINIMO))
  return { listaCop, finalCop, descuentoCop: listaCop - finalCop, listaUsd, finalUsd }
}

/** Con qué enlace llegó quien compra. */
export interface Atribucion {
  promo?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
}

export interface PromoElegible extends DescuentoPromo {
  planIds: string[]
  appliesToNew: boolean
  appliesToRenewals: boolean
  audience: string
  code: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  priority: number
  createdAt: Date | string | number
}

const igual = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * ¿Le corresponde esta promo a quien llegó con esa atribución? `ALL` siempre.
 * `LINK`: coincide el código, O bien todos los utm configurados (al menos uno).
 */
export function cumpleAtribucion(promo: Pick<PromoElegible, 'audience' | 'code' | 'utmSource' | 'utmMedium' | 'utmCampaign'>, atr: Atribucion | null | undefined): boolean {
  if (promo.audience !== 'LINK') return true
  if (!atr) return false
  if (promo.code && igual(promo.code, atr.promo)) return true
  const utm: Array<[string | null, string | null | undefined]> = [
    [promo.utmSource, atr.utm_source],
    [promo.utmMedium, atr.utm_medium],
    [promo.utmCampaign, atr.utm_campaign],
  ]
  const configurados = utm.filter(([cfg]) => !!cfg)
  return configurados.length > 0 && configurados.every(([cfg, vis]) => igual(cfg, vis))
}

/** ¿Aplica a este plan y a este tipo de compra (nueva o renovación)? */
export function aplicaAPlan(promo: Pick<PromoElegible, 'planIds' | 'appliesToNew' | 'appliesToRenewals'>, planId: string, esRenovacion: boolean): boolean {
  if (promo.planIds.length > 0 && !promo.planIds.includes(planId)) return false
  return esRenovacion ? promo.appliesToRenewals : promo.appliesToNew
}

/**
 * La mejor promo para un plan: la de mayor descuento en COP; si empatan, la de
 * mayor prioridad; y si aún empatan, la más nueva.
 */
export function mejorPromo<T extends PromoElegible>(
  promos: T[],
  plan: PlanPrecio & { id: string },
  trmCop: number,
  esRenovacion: boolean,
  atr: Atribucion | null | undefined,
): { promo: T; precio: PrecioPromo } | null {
  let mejor: { promo: T; precio: PrecioPromo } | null = null
  for (const promo of promos) {
    if (!aplicaAPlan(promo, plan.id, esRenovacion) || !cumpleAtribucion(promo, atr)) continue
    const precio = precioConPromo(plan, trmCop, promo)
    if (precio.descuentoCop <= 0) continue
    if (!mejor) { mejor = { promo, precio }; continue }
    const d = precio.descuentoCop - mejor.precio.descuentoCop
    if (d > 0) mejor = { promo, precio }
    else if (d === 0) {
      const p = promo.priority - mejor.promo.priority
      if (p > 0 || (p === 0 && new Date(promo.createdAt).getTime() > new Date(mejor.promo.createdAt).getTime())) {
        mejor = { promo, precio }
      }
    }
  }
  return mejor
}

/** Activa = encendida, dentro de fechas y con usos disponibles. */
export function estaVigente(
  promo: { isActive: boolean; startsAt: Date | null; endsAt: Date | null; maxRedemptions: number | null },
  ahora: Date,
  usos: number,
): boolean {
  if (!promo.isActive) return false
  if (promo.startsAt && promo.startsAt.getTime() > ahora.getTime()) return false
  if (promo.endsAt && promo.endsAt.getTime() <= ahora.getTime()) return false
  if (promo.maxRedemptions !== null && usos >= promo.maxRedemptions) return false
  return true
}
