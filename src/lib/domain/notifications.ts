/**
 * Automaciones (Fase 7) — registro y disparo de notificaciones.
 *
 * Diseñado como mock pero con la **misma forma** que el sistema final:
 *   - Cada notificación se persiste en `notifications` (tabla → ver
 *     docs/data-model.md).
 *   - El "envío" pasa por un transporte intercambiable (`Transport`).
 *     - `LogTransport` (default): solo registra en consola/DB. No requiere
 *       backend — ideal para mocks en frontend.
 *     - `ResendTransport` (placeholder): cuando Lovable Cloud o el server
 *       Railway estén listos, este transport hace `POST` a un endpoint que
 *       a su vez llama a Resend con `RESEND_API_KEY`. El contrato del
 *       payload (`to`, `subject`, `html`) NO cambia entre mock y prod.
 *   - El **scheduler** (`runAutomations`) se ejecuta:
 *       (a) on-demand desde el panel admin para verlo;
 *       (b) lazy al entrar al portal estudiante (recordatorios próximos).
 *     En producción será un cron job documentado en `docs/backend-jobs.md`.
 */
import { readDb, uid, writeDb, type DbShape } from "./repository";
import type { ClassSession, PlanId, Subscription, User } from "./types";
import type { PaymentIntent } from "./subscriptions";
import { PLANS } from "./plans";
import { renderTemplate, type TemplateKey, type TemplateVars } from "./notification-templates";

export type NotificationChannel = "email" | "whatsapp" | "in_app";
export type NotificationStatus = "queued" | "sent" | "failed" | "skipped";

export interface NotificationRecord {
  id: string;
  /** Identificador estable para evitar duplicados (idempotencia). */
  dedupeKey: string;
  userId: string | null;
  to: string;
  channel: NotificationChannel;
  template: TemplateKey;
  subject: string;
  /** HTML renderizado, listo para Resend. */
  body: string;
  status: NotificationStatus;
  createdAt: string;
  sentAt?: string;
  error?: string;
  /** Datos crudos del template (para auditoría y migración). */
  vars: TemplateVars;
}

function table(db = readDb()): Record<string, NotificationRecord> {
  // `notifications` puede no existir en DBs previas — degradamos en caliente.
  const anyDb = db as DbShape & { notifications?: Record<string, NotificationRecord> };
  if (!anyDb.notifications) anyDb.notifications = {};
  return anyDb.notifications;
}

export function listNotifications(): NotificationRecord[] {
  return Object.values(table()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listNotificationsFor(userId: string): NotificationRecord[] {
  return listNotifications().filter((n) => n.userId === userId);
}

// ---------- Transport (intercambiable) ----------

export interface Transport {
  send(n: NotificationRecord): Promise<{ ok: boolean; error?: string }>;
}

/** Mock: no envía, solo loguea. Es el transport activo por defecto. */
export const LogTransport: Transport = {
  async send(n) {
    if (typeof console !== "undefined") {
      console.info("[notifications:mock]", n.channel, "→", n.to, "·", n.subject);
    }
    return { ok: true };
  },
};

/**
 * Placeholder para producción. En Lovable Cloud / Railway, la implementación
 * real hace `fetch('/api/notifications/send', { body: JSON.stringify(n) })`
 * y el server-side llama a Resend con `RESEND_API_KEY`. Aquí lo dejamos
 * inerte para que la migración solo cambie 1 línea (`activeTransport`).
 */
export const ResendTransport: Transport = {
  async send() {
    return { ok: false, error: "ResendTransport no configurado en mock." };
  },
};

let activeTransport: Transport = LogTransport;
export function setTransport(t: Transport) {
  activeTransport = t;
}

// ---------- Enqueue + send ----------

function findByDedupe(key: string): NotificationRecord | null {
  return Object.values(table()).find((n) => n.dedupeKey === key) ?? null;
}

export async function enqueueNotification(input: {
  dedupeKey: string;
  userId: string | null;
  to: string;
  channel?: NotificationChannel;
  template: TemplateKey;
  vars: TemplateVars;
}): Promise<NotificationRecord> {
  // Idempotencia: si ya existe, devolverla intacta.
  const existing = findByDedupe(input.dedupeKey);
  if (existing) return existing;

  const rendered = renderTemplate(input.template, input.vars);
  const record: NotificationRecord = {
    id: uid("ntf"),
    dedupeKey: input.dedupeKey,
    userId: input.userId,
    to: input.to,
    channel: input.channel ?? "email",
    template: input.template,
    subject: rendered.subject,
    body: rendered.html,
    status: "queued",
    createdAt: new Date().toISOString(),
    vars: input.vars,
  };
  writeDb((db) => {
    table(db)[record.id] = record;
  });

  const result = await activeTransport.send(record);
  writeDb((db) => {
    const stored = table(db)[record.id];
    if (!stored) return;
    stored.status = result.ok ? "sent" : "failed";
    stored.sentAt = new Date().toISOString();
    if (!result.ok) stored.error = result.error;
  });
  return record;
}

// ---------- Scheduler ----------

/**
 * Recorre el estado actual y encola cualquier notificación pendiente:
 *  - welcome: para suscripciones activas sin email de bienvenida.
 *  - abandoned-cart: payment intents PENDING > 30 min sin email.
 *  - class-reminder-24h / -1h: clases próximas en ventanas.
 *  - nps-monthly: 1 vez por mes por usuario activo.
 *  - subscription-renewal: 3 días antes de `currentPeriodEnd`.
 *
 * Idempotente — se puede llamar tantas veces como se quiera.
 * Devuelve cuántas se encolaron nuevas en esta corrida.
 */
export async function runAutomations(): Promise<number> {
  const db = readDb();
  const users = Object.values(db.users as Record<string, User>);
  const subs = Object.values(db.subscriptions as Record<string, Subscription>);
  const intents = Object.values(db.paymentIntents as Record<string, PaymentIntent>);
  const classes = Object.values(db.classes as Record<string, ClassSession>);
  const now = Date.now();
  let count = 0;

  // 1. Welcome
  for (const sub of subs) {
    if (sub.status !== "active") continue;
    const user = users.find((u) => u.id === sub.userId);
    if (!user) continue;
    const key = `welcome:${sub.id}`;
    if (findByDedupe(key)) continue;
    await enqueueNotification({
      dedupeKey: key,
      userId: user.id,
      to: user.email,
      template: "welcome",
      vars: { fullName: user.fullName, planLabel: planLabel(sub.planId) },
    });
    count++;
  }

  // 2. Abandoned cart: intents PENDING creados hace >30 min y < 7 días.
  for (const it of intents) {
    if (it.status !== "PENDING") continue;
    const ageMin = (now - new Date(it.createdAt).getTime()) / 60000;
    if (ageMin < 30 || ageMin > 60 * 24 * 7) continue;
    const key = `abandoned:${it.reference}`;
    if (findByDedupe(key)) continue;
    await enqueueNotification({
      dedupeKey: key,
      userId: it.userId ?? null,
      to: it.customer.email,
      template: "abandoned-cart",
      vars: {
        fullName: it.customer.fullName,
        planLabel: planLabel(it.planId),
        resumeUrl: `/checkout/${it.planId}?ref=${it.reference}`,
      },
    });
    count++;
  }

  // 3. Recordatorios de clase (24h y 1h)
  for (const c of classes) {
    if (c.status !== "scheduled") continue;
    const minsTo = (new Date(c.startsAt).getTime() - now) / 60000;
    const user = users.find((u) => u.id === c.studentId);
    if (!user) continue;
    if (minsTo > 60 * 23 && minsTo <= 60 * 25) {
      const key = `class-reminder-24h:${c.id}`;
      if (!findByDedupe(key)) {
        await enqueueNotification({
          dedupeKey: key,
          userId: user.id,
          to: user.email,
          template: "class-reminder",
          vars: {
            fullName: user.fullName,
            whenLabel: "mañana",
            startsAt: c.startsAt,
            meetingUrl: c.meetingUrl ?? "/app/calendar",
          },
        });
        count++;
      }
    }
    if (minsTo > 50 && minsTo <= 70) {
      const key = `class-reminder-1h:${c.id}`;
      if (!findByDedupe(key)) {
        await enqueueNotification({
          dedupeKey: key,
          userId: user.id,
          to: user.email,
          template: "class-reminder",
          vars: {
            fullName: user.fullName,
            whenLabel: "en 1 hora",
            startsAt: c.startsAt,
            meetingUrl: c.meetingUrl ?? "/app/calendar",
          },
        });
        count++;
      }
    }
  }

  // 4. Renovación: suscripciones que vencen en ≤ 3 días.
  for (const sub of subs) {
    if (sub.status !== "active") continue;
    const daysLeft = (new Date(sub.currentPeriodEnd).getTime() - now) / 86_400_000;
    if (daysLeft > 3 || daysLeft < 0) continue;
    const user = users.find((u) => u.id === sub.userId);
    if (!user) continue;
    const key = `renewal:${sub.id}:${sub.currentPeriodEnd.slice(0, 10)}`;
    if (findByDedupe(key)) continue;
    await enqueueNotification({
      dedupeKey: key,
      userId: user.id,
      to: user.email,
      template: "renewal-reminder",
      vars: {
        fullName: user.fullName,
        planLabel: planLabel(sub.planId),
        renewsAt: sub.currentPeriodEnd,
      },
    });
    count++;
  }

  // 5. NPS mensual: 1 vez por mes por estudiante con suscripción activa.
  const monthKey = new Date().toISOString().slice(0, 7);
  for (const sub of subs) {
    if (sub.status !== "active") continue;
    const user = users.find((u) => u.id === sub.userId);
    if (!user) continue;
    const key = `nps:${user.id}:${monthKey}`;
    if (findByDedupe(key)) continue;
    await enqueueNotification({
      dedupeKey: key,
      userId: user.id,
      to: user.email,
      channel: "in_app",
      template: "nps-monthly",
      vars: { fullName: user.fullName, monthLabel: monthKey },
    });
    count++;
  }

  return count;
}

function planLabel(planId: PlanId): string {
  return PLANS.find((p) => p.id === planId)?.label ?? planId;
}