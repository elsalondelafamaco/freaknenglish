/**
 * Precio con promoción, en el navegador.
 *
 * GEMELO de `backend/src/modules/promotions/promo-precio.ts`: el servidor es
 * quien decide lo que se cobra, y esto solo lo muestra, así que las dos reglas
 * tienen que dar el mismo número (mismo redondeo, mismo mínimo, mismo desempate).
 * Si tocas esta, toca la otra.
 */
import type { PromoPublica } from "@/lib/api/endpoints";

export type { PromoPublica };

/** Wompi no cobra montos muy bajos: ninguna promo deja el plan por debajo. */
export const COP_MINIMO = 5000;

export type PlanPrecio = { id?: string; priceCop: number; priceUsd?: number | null };

export type PrecioPromo = {
  /** Precio de lista en COP, antes del descuento. */
  listaCop: number;
  /** Lo que se cobra en COP. */
  finalCop: number;
  descuentoCop: number;
  listaUsd: number | null;
  /** USD con descuento; null si el descuento es en COP. */
  finalUsd: number | null;
};

type Descuento = Pick<PromoPublica, "discountType" | "discountValue">;

export function precioConPromo(
  plan: PlanPrecio,
  trm: number | null | undefined,
  promo: Descuento | null,
): PrecioPromo {
  const trmCop = trm && trm > 0 ? trm : 0;
  const listaUsd = plan.priceUsd && plan.priceUsd > 0 ? plan.priceUsd : null;
  const tieneUsd = listaUsd !== null && trmCop > 0;
  const listaCop = tieneUsd ? Math.round((listaUsd as number) * trmCop) : plan.priceCop;
  if (!promo) return { listaCop, finalCop: listaCop, descuentoCop: 0, listaUsd, finalUsd: listaUsd };

  const v = promo.discountValue;
  let cop = listaCop;
  let finalUsd: number | null = listaUsd;
  if (promo.discountType === "PERCENT") {
    cop = Math.round((listaCop * (100 - v)) / 100);
    finalUsd = listaUsd === null ? null : Math.round(listaUsd * (100 - v)) / 100;
  } else if (promo.discountType === "USD") {
    if (tieneUsd) {
      finalUsd = Math.max((listaUsd as number) - v, 0);
      cop = Math.round(finalUsd * trmCop);
    } else {
      cop = listaCop - Math.round(v * trmCop);
      finalUsd = null;
    }
  } else if (promo.discountType === "COP") {
    cop = listaCop - v;
    finalUsd = null;
  }
  const finalCop = Math.min(listaCop, Math.max(cop, COP_MINIMO));
  return { listaCop, finalCop, descuentoCop: listaCop - finalCop, listaUsd, finalUsd };
}

/**
 * La mejor promo para un plan: la de mayor descuento en COP; si empatan, la de
 * mayor prioridad; y si aún empatan, la más nueva. Con `soloVisibles` ignora las
 * promos "silenciosas" (las que no se anuncian en precios).
 */
export function mejorPromo(
  promos: PromoPublica[] | undefined,
  plan: PlanPrecio,
  trm: number | null | undefined,
  esRenovacion: boolean,
  opts: { soloVisibles?: boolean } = {},
): { promo: PromoPublica; precio: PrecioPromo } | null {
  let mejor: { promo: PromoPublica; precio: PrecioPromo } | null = null;
  for (const promo of promos ?? []) {
    if (promo.planIds.length > 0 && (!plan.id || !promo.planIds.includes(plan.id))) continue;
    if (!(esRenovacion ? promo.appliesToRenewals : promo.appliesToNew)) continue;
    if (opts.soloVisibles && !promo.showOnPrices) continue;
    if (promo.endsAt && new Date(promo.endsAt).getTime() <= Date.now()) continue;
    const precio = precioConPromo(plan, trm, promo);
    if (precio.descuentoCop <= 0) continue;
    if (!mejor) {
      mejor = { promo, precio };
      continue;
    }
    const d = precio.descuentoCop - mejor.precio.descuentoCop;
    if (d > 0) mejor = { promo, precio };
    else if (d === 0) {
      const p = promo.priority - mejor.promo.priority;
      if (p > 0 || (p === 0 && new Date(promo.createdAt).getTime() > new Date(mejor.promo.createdAt).getTime())) {
        mejor = { promo, precio };
      }
    }
  }
  return mejor;
}

/** Texto de la insignia: el que escribió el admin, o "-20%" / "-$30 USD" / "-$50.000". */
export function textoBadge(promo: Pick<PromoPublica, "badgeText" | "discountType" | "discountValue">): string {
  if (promo.badgeText?.trim()) return promo.badgeText.trim();
  if (promo.discountType === "PERCENT") return `-${promo.discountValue}%`;
  if (promo.discountType === "USD") return `-$${promo.discountValue} USD`;
  return `-$${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(promo.discountValue)} COP`;
}

/** USD sin decimales cuando es entero ("$30"), con dos si no ("$24.50"). */
export function formatUsd(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

/** La promo que manda el banner de la home: la de mayor prioridad con `showBanner`. */
export function promoDeBanner(promos: PromoPublica[] | undefined): PromoPublica | null {
  const lista = (promos ?? []).filter(
    (p) => p.showBanner && (!p.endsAt || new Date(p.endsAt).getTime() > Date.now()),
  );
  if (lista.length === 0) return null;
  return lista.sort(
    (a, b) => b.priority - a.priority || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];
}
