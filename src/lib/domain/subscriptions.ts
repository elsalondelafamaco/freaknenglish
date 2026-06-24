/**
 * Helpers de "intenciones de pago" y suscripciones (mock).
 *
 * En producción esto vive en backend:
 *   - `POST /api/v1/payments/intents` crea la intención y devuelve `reference`.
 *   - El webhook `wompi-payment-events` (ver docs/backend-jobs.md) cambia el
 *     estado a `APPROVED` y activa la suscripción + envía email Resend.
 */
import { readDb, uid, writeDb } from "./repository";
import type { PlanId, Subscription } from "./types";

export type PaymentStatus = "PENDING" | "APPROVED" | "DECLINED" | "VOIDED";

export interface PaymentIntent {
  id: string;
  reference: string;
  planId: PlanId;
  amountCop: number;
  customer: { fullName: string; email: string; phone?: string; document?: string };
  status: PaymentStatus;
  /** Si ya creamos un usuario nuevo asociado a esta intención. */
  userId?: string;
  createdAt: string;
  updatedAt: string;
}

function refForPlan(planId: PlanId): string {
  return `frk_${planId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createPaymentIntent(input: {
  planId: PlanId;
  amountCop: number;
  customer: PaymentIntent["customer"];
}): PaymentIntent {
  const now = new Date().toISOString();
  const intent: PaymentIntent = {
    id: uid("pi"),
    reference: refForPlan(input.planId),
    planId: input.planId,
    amountCop: input.amountCop,
    customer: input.customer,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
  };
  writeDb((db) => {
    (db.paymentIntents as Record<string, PaymentIntent>)[intent.reference] = intent;
  });
  return intent;
}

export function getPaymentIntent(reference: string): PaymentIntent | null {
  const db = readDb();
  return ((db.paymentIntents as Record<string, PaymentIntent>)[reference] as PaymentIntent) ?? null;
}

/**
 * Marca la intención con el estado devuelto por Wompi (o por el simulador local)
 * y, si fue APPROVED, crea/activa la suscripción del usuario.
 *
 * @migration en producción este método NO se ejecuta en el frontend: corre en
 *   el webhook server-side luego de verificar la firma con `WOMPI_EVENTS_KEY`.
 */
export function resolvePayment(
  reference: string,
  status: PaymentStatus,
  userId?: string,
): { intent: PaymentIntent | null; subscription: Subscription | null } {
  let subscription: Subscription | null = null;
  let intent: PaymentIntent | null = null;
  writeDb((db) => {
    const map = db.paymentIntents as Record<string, PaymentIntent>;
    const it = map[reference];
    if (!it) return;
    it.status = status;
    it.updatedAt = new Date().toISOString();
    if (userId) it.userId = userId;
    intent = it;
    if (status === "APPROVED" && userId) {
      const sub: Subscription = {
        id: uid("sub"),
        userId,
        planId: it.planId,
        status: "active",
        startedAt: it.updatedAt,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        wompiReference: reference,
      };
      (db.subscriptions as Record<string, Subscription>)[sub.id] = sub;
      subscription = sub;
    }
  });
  return { intent, subscription };
}