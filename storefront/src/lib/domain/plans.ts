/**
 * Catálogo de planes (fuente de verdad para landing y checkout).
 *
 * `priceCop` se usa para el Widget de Wompi (`data-amount-in-cents`).
 * `priceDisplay` es lo que se muestra en la landing (no se usa para cobrar).
 *
 * Migración: tabla `plans` en Postgres con columnas equivalentes.
 * Ver `docs/data-model.md`.
 */
import type { PlanId } from "./types";

export interface Plan {
  id: PlanId;
  daysPerWeek: number;
  name: string;
  tag?: string;
  priceDisplay: string;
  /** Precio mensual en COP (entero, sin decimales). */
  priceCop: number;
  highlight?: boolean;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "2-dias",
    daysPerWeek: 2,
    name: "2 días por Semana",
    tag: "Para mantener el ritmo",
    priceDisplay: "$110",
    priceCop: 440_000,
    features: [
      "Clases 1 a 1 en vivo",
      "Conversación desde el día 1",
      "Feedback personalizado",
      "Horarios fijos",
    ],
  },
  {
    id: "3-dias",
    daysPerWeek: 3,
    name: "3 días por Semana",
    tag: "Ideal si estás empezando",
    priceDisplay: "$155",
    priceCop: 620_000,
    features: [
      "Clases 1 a 1 en vivo",
      "Conversación desde el día 1",
      "Feedback personalizado",
      "Horarios fijos",
    ],
  },
  {
    id: "4-dias",
    daysPerWeek: 4,
    name: "4 días por Semana",
    priceDisplay: "$190",
    priceCop: 760_000,
    highlight: true,
    features: [
      "Clases 1 a 1 en vivo",
      "Conversación desde el día 1",
      "Feedback personalizado",
      "Horarios fijos",
    ],
  },
  {
    id: "5-dias",
    daysPerWeek: 5,
    name: "5 días por semana",
    tag: "Para avanzar lo más rápido posible",
    priceDisplay: "$225",
    priceCop: 900_000,
    features: [
      "Clases 1 a 1 en vivo",
      "Conversación desde el día 1",
      "Feedback personalizado",
      "Horarios fijos",
    ],
  },
];

export function getPlan(id: string): Plan | null {
  return PLANS.find((p) => p.id === id) ?? null;
}

export function formatCop(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}
/**
 * COP que realmente se le va a cobrar a un plan.
 *
 * Es la MISMA regla del backend (`checkout.service.ts`): el precio de venta es
 * el USD y se convierte con la TRM del día; `priceCop` es solo el respaldo para
 * planes sin USD. La home mostraba `priceCop` a secas, que quedó viejo, así que
 * anunciaba un valor distinto al que después salía en el checkout y en el cobro.
 *
 * Vive aquí para que landing y checkout no puedan volver a divergir.
 */
export function copAcobrar(
  plan: { priceUsd?: number | null; priceCop: number },
  trm: number | null | undefined,
): number {
  if (plan.priceUsd && plan.priceUsd > 0 && trm && trm > 0) {
    return Math.round(plan.priceUsd * trm);
  }
  return plan.priceCop;
}
