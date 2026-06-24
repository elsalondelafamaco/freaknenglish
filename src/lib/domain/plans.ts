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