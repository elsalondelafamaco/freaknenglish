/**
 * Hidrata el repositorio en memoria (`readDb`) con datos reales del backend.
 *
 * El storefront se construyó originalmente con un "DB" en localStorage. Para
 * conectarlo al backend sin reescribir las 20+ rutas que dependen de ese
 * shape, hidratamos el mismo store con la respuesta del API tras login.
 *
 * Esto se va a ELIMINAR cuando cada ruta migre a `useQuery` directo contra
 * `endpoints.ts`. Por ahora es el shim que vuelve la app funcional
 * end-to-end con el menor número de cambios.
 */
import { writeDb, resetDb } from "@/lib/domain/repository";
import type {
  ClassNote,
  ClassSession,
  LearningModule,
  LessonProgress,
  Subscription,
  User,
  CheckpointAttempt,
} from "@/lib/domain/types";
import {
  classesApi,
  learningApi,
  subscriptionsApi,
  teachersApi,
  adminApi,
  surveysApi,
  usersApi,
} from "./endpoints";

/** Mapea el shape del backend (Prisma) al shape del storefront. */
function adaptClass(c: any, currentUserRole: string): ClassSession {
  return {
    id: c.id,
    studentId: c.studentId,
    teacherId: c.teacherId ?? "",
    teacherName: c.teacher?.fullName ?? (currentUserRole === "teacher" ? "Tú" : "Profe"),
    startsAt: c.startsAt,
    durationMin: c.endsAt
      ? Math.round((new Date(c.endsAt).getTime() - new Date(c.startsAt).getTime()) / 60000)
      : 50,
    status:
      c.status === "validated"
        ? "completed"
        : c.status === "cancelled"
        ? "canceled"
        : c.status === "no_show"
        ? "missed"
        : "scheduled",
    studentConfirmedAt: c.validatedAt ?? undefined,
    teacherValidatedAt: c.validatedAt ?? undefined,
    topic: c.topic ?? undefined,
    meetingUrl: c.meetingUrl ?? undefined,
  };
}

function adaptUser(u: any): User {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    avatarUrl: u.avatarUrl ?? undefined,
    roles: [u.role],
    level: u.englishLevel ?? undefined,
    onboardedAt: u.emailVerifiedAt ?? undefined,
    createdAt: u.createdAt,
  };
}

function adaptSubscription(s: any): Subscription | null {
  if (!s) return null;
  return {
    id: s.id,
    userId: s.userId,
    planId: s.planId,
    status: s.status,
    startedAt: s.startedAt ?? undefined,
    currentPeriodEnd: s.currentPeriodEnd ?? undefined,
    wompiReference: s.wompiCustomerId ?? undefined,
  };
}

function adaptModule(m: any): LearningModule {
  return {
    id: m.id,
    level: m.level,
    order: m.position,
    title: m.title,
    summary: m.description ?? "",
    coverEmoji: "📘",
    lessons: (m.lessons ?? []).map((l: any) => ({
      id: l.id,
      moduleId: l.moduleId,
      order: l.position,
      title: l.title,
      kind: l.videoUrl ? "video" : l.pdfUrl ? "pdf" : l.slidesUrl ? "slides" : "download",
      url: l.videoUrl ?? l.pdfUrl ?? l.slidesUrl ?? (l.downloadUrls?.[0] ?? ""),
      estMinutes: l.durationMin ?? 10,
    })),
    checkpointId: m.checkpoints?.[0]?.id,
  };
}

/**
 * Trae todos los datos del usuario actual y los pone en el store en memoria.
 * Se llama desde AuthProvider tras login/refresh exitoso.
 */
export async function hydrateFromBackend(currentUserRole: string): Promise<User | null> {
  try {
    const [me, mySub, classes, modules, progress] = await Promise.all([
      usersApi.me() as Promise<any>,
      subscriptionsApi.mine().catch(() => null),
      classesApi.list().catch(() => []) as Promise<any[]>,
      learningApi.modules().catch(() => []) as Promise<any[]>,
      learningApi.progress().catch(() => null),
    ]);

    const adaptedUser = adaptUser(me);
    const adaptedSub = adaptSubscription(mySub);

    writeDb((db) => {
      (db.users as Record<string, User>)[adaptedUser.id] = adaptedUser;
      if (adaptedSub) (db.subscriptions as Record<string, Subscription>)[adaptedSub.id] = adaptedSub;
      const adaptedClasses = (classes ?? []).map((c) => adaptClass(c, currentUserRole));
      db.classes = {};
      for (const c of adaptedClasses) (db.classes as Record<string, ClassSession>)[c.id] = c;

      // Hidrata módulos en una key auxiliar dentro de `meta` (las rutas que los
      // consumen leen vía learning.ts service helpers).
      (db.meta as any).modules = (modules ?? []).map(adaptModule);

      if (progress) {
        db.lessonProgress = {};
        // Los IDs de progreso del backend tienen su propio formato; aquí solo
        // registramos los lessonId completados.
        // El servicio mock `learning.ts` lee la presencia por `${userId}:${lessonId}`.
        for (const _ of []) {
          // backend `userProgress` ya envía `lessonsCompleted` agregado;
          // las páginas que necesitan detalle por-lección llaman directo a
          // `learningApi.module(id)` que ya trae el detalle.
        }
        (db.meta as any).learningProgress = progress;
      }
    });

    // Datos específicos por rol
    if (adaptedUser.roles.includes("teacher")) {
      try {
        const [students, _schedule] = await Promise.all([
          teachersApi.students().catch(() => []) as Promise<any[]>,
          teachersApi.schedule("upcoming").catch(() => []) as Promise<any[]>,
        ]);
        writeDb((db) => {
          for (const s of students ?? []) (db.users as Record<string, User>)[s.id] = adaptUser(s);
        });
      } catch { /* ignore */ }
    }

    if (adaptedUser.roles.includes("admin")) {
      try {
        const [users, analytics, notifications] = await Promise.all([
          adminApi.users().catch(() => []) as Promise<any[]>,
          adminApi.analytics().catch(() => null),
          adminApi.notifications().catch(() => []) as Promise<any[]>,
        ]);
        writeDb((db) => {
          for (const u of users ?? []) (db.users as Record<string, User>)[u.id] = adaptUser(u);
          (db.meta as any).analytics = analytics;
          db.notifications = {};
          for (const n of notifications ?? []) (db.notifications as Record<string, any>)[n.id] = n;
        });
      } catch { /* ignore */ }
    }

    return adaptedUser;
  } catch (e) {
    console.error("[bootstrap] hydration failed", e);
    return null;
  }
}

/** Borra todo el cache local (logout). */
export function clearLocalState() {
  resetDb();
}

/** Re-exporta adaptadores por si alguna ruta los necesita. */
export const adapters = { adaptUser, adaptClass, adaptModule, adaptSubscription };