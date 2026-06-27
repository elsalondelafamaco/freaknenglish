/**
 * Helpers para el panel admin (Fase 6).
 *
 * Cubre 4 áreas: CRM (usuarios + suscripciones), CMS (catálogo de módulos),
 * Analytics (KPIs agregados), Payroll (pago a profesores por clase
 * completada + validada).
 *
 * @migration En Postgres todas estas funciones serán queries SQL sobre las
 * tablas existentes (ver `docs/data-model.md`). Ninguna depende de Supabase.
 */
import type {
  ClassSession,
  SatisfactionSurvey,
  Subscription,
  User,
} from "./types";
import { readDb } from "./repository";
import { PLAN_BY_ID } from "./plans";

/** Tarifa que paga la plataforma al profesor por clase completada + validada. */
export const TEACHER_PAYRATE_COP = 18000;

export interface UserRow {
  user: User;
  subscription?: Subscription;
  planLabel?: string;
  classes: number;
  lastClassAt?: string;
}

export function listAllUsers(): UserRow[] {
  const db = readDb();
  const users = Object.values(db.users as Record<string, User>);
  const subs = Object.values(db.subscriptions as Record<string, Subscription>);
  const classes = Object.values(db.classes as Record<string, ClassSession>);

  return users
    .map((u) => {
      const sub = subs.find((s) => s.userId === u.id);
      const userClasses = classes.filter((c) => c.studentId === u.id || c.teacherId === u.id);
      const last = userClasses
        .map((c) => c.startsAt)
        .sort()
        .pop();
      return {
        user: u,
        subscription: sub,
        planLabel: sub ? PLAN_BY_ID[sub.planId]?.name : undefined,
        classes: userClasses.length,
        lastClassAt: last,
      };
    })
    .sort((a, b) => a.user.fullName.localeCompare(b.user.fullName));
}

export interface AdminKpis {
  totalUsers: number;
  students: number;
  teachers: number;
  activeSubscriptions: number;
  mrrCop: number;
  classesThisMonth: number;
  completionRate: number;
  npsScore: number | null;
}

export function computeKpis(): AdminKpis {
  const db = readDb();
  const users = Object.values(db.users as Record<string, User>);
  const subs = Object.values(db.subscriptions as Record<string, Subscription>);
  const classes = Object.values(db.classes as Record<string, ClassSession>);
  const surveys = Object.values(
    db.satisfactionSurveys as Record<string, SatisfactionSurvey>,
  );

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthClasses = classes.filter(
    (c) => new Date(c.startsAt).getTime() >= monthStart.getTime(),
  );
  const pastMonth = monthClasses.filter(
    (c) => new Date(c.startsAt).getTime() < Date.now(),
  );
  const completed = pastMonth.filter((c) => c.status === "completed").length;
  const completionRate =
    pastMonth.length === 0 ? 0 : Math.round((completed / pastMonth.length) * 100);

  const activeSubs = subs.filter((s) => s.status === "active");
  const mrr = activeSubs.reduce(
    (acc, s) => acc + (PLAN_BY_ID[s.planId]?.priceCop ?? 0),
    0,
  );

  // NPS = % promotores (9-10) - % detractores (0-6)
  let nps: number | null = null;
  if (surveys.length > 0) {
    const promoters = surveys.filter((s) => s.nps >= 9).length;
    const detractors = surveys.filter((s) => s.nps <= 6).length;
    nps = Math.round(((promoters - detractors) / surveys.length) * 100);
  }

  return {
    totalUsers: users.length,
    students: users.filter((u) => u.roles.includes("student")).length,
    teachers: users.filter((u) => u.roles.includes("teacher")).length,
    activeSubscriptions: activeSubs.length,
    mrrCop: mrr,
    classesThisMonth: monthClasses.length,
    completionRate,
    npsScore: nps,
  };
}

export interface PayrollRow {
  teacher: User;
  validatedClasses: number;
  amountCop: number;
}

/** Planilla del mes en curso: 1 clase validada = TEACHER_PAYRATE_COP. */
export function computePayroll(monthKey?: string): {
  monthKey: string;
  rows: PayrollRow[];
  totalCop: number;
} {
  const db = readDb();
  const users = db.users as Record<string, User>;
  const classes = Object.values(db.classes as Record<string, ClassSession>);

  const now = new Date();
  const key =
    monthKey ??
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const filtered = classes.filter((c) => {
    if (c.status !== "completed" || !c.teacherValidatedAt) return false;
    const d = new Date(c.startsAt);
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return k === key;
  });

  const byTeacher = new Map<string, ClassSession[]>();
  for (const c of filtered) {
    const arr = byTeacher.get(c.teacherId) ?? [];
    arr.push(c);
    byTeacher.set(c.teacherId, arr);
  }

  const rows: PayrollRow[] = [];
  for (const [teacherId, list] of byTeacher) {
    const teacher = users[teacherId];
    if (!teacher) continue;
    rows.push({
      teacher,
      validatedClasses: list.length,
      amountCop: list.length * TEACHER_PAYRATE_COP,
    });
  }
  rows.sort((a, b) => b.amountCop - a.amountCop);
  const total = rows.reduce((acc, r) => acc + r.amountCop, 0);
  return { monthKey: key, rows, totalCop: total };
}

export function formatCop(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}