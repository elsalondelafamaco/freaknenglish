/**
 * Calendario de clases 1-on-1 + asistencia.
 *
 * Reglas de negocio:
 * - Cancelar / reprogramar requiere ≥ 12h de anticipación (configurable
 *   en `RESCHEDULE_LOCK_HOURS`). El plan de producto pide entre 12-24h;
 *   dejamos 12h por defecto y se ajustará desde panel admin.
 * - "Sí, tomé mi clase hoy" marca asistencia del lado del estudiante;
 *   el profesor luego valida (Fase 5).
 */
import type { ClassSession } from "./types";
import { readDb, writeDb, uid } from "./repository";

export const RESCHEDULE_LOCK_HOURS = 12;

function table(): Record<string, ClassSession> {
  return readDb().classes as Record<string, ClassSession>;
}

export function listClassesFor(studentId: string): ClassSession[] {
  return Object.values(table())
    .filter((c) => c.studentId === studentId)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function nextClassFor(studentId: string): ClassSession | null {
  const now = Date.now();
  return (
    listClassesFor(studentId).find(
      (c) =>
        c.status === "scheduled" &&
        new Date(c.startsAt).getTime() >= now - 60 * 60 * 1000,
    ) ?? null
  );
}

export function todaysClassFor(studentId: string): ClassSession | null {
  const today = new Date().toISOString().slice(0, 10);
  return (
    listClassesFor(studentId).find(
      (c) => c.startsAt.startsWith(today) && c.status !== "canceled",
    ) ?? null
  );
}

export function canModify(c: ClassSession): boolean {
  if (c.status !== "scheduled") return false;
  const hoursAhead = (new Date(c.startsAt).getTime() - Date.now()) / 36e5;
  return hoursAhead >= RESCHEDULE_LOCK_HOURS;
}

export function cancelClass(id: string): { ok: boolean; reason?: string } {
  const c = table()[id];
  if (!c) return { ok: false, reason: "Clase no encontrada." };
  if (!canModify(c))
    return {
      ok: false,
      reason: `No puedes cancelar con menos de ${RESCHEDULE_LOCK_HOURS}h de anticipación.`,
    };
  writeDb((db) => {
    (db.classes as Record<string, ClassSession>)[id] = { ...c, status: "canceled" };
  });
  return { ok: true };
}

export function rescheduleClass(
  id: string,
  newStartIso: string,
): { ok: boolean; reason?: string } {
  const c = table()[id];
  if (!c) return { ok: false, reason: "Clase no encontrada." };
  if (!canModify(c))
    return {
      ok: false,
      reason: `No puedes reprogramar con menos de ${RESCHEDULE_LOCK_HOURS}h de anticipación.`,
    };
  writeDb((db) => {
    (db.classes as Record<string, ClassSession>)[id] = { ...c, startsAt: newStartIso };
  });
  return { ok: true };
}

export function confirmAttendance(id: string): { ok: boolean; reason?: string } {
  const c = table()[id];
  if (!c) return { ok: false, reason: "Clase no encontrada." };
  writeDb((db) => {
    (db.classes as Record<string, ClassSession>)[id] = {
      ...c,
      status: "completed",
      studentConfirmedAt: new Date().toISOString(),
    };
  });
  return { ok: true };
}

/** Crea clases de ejemplo si el estudiante demo todavía no tiene. */
export function ensureDemoClasses(studentId: string, teacherId: string, teacherName: string) {
  const existing = listClassesFor(studentId);
  if (existing.length > 0) return;
  const today = new Date();
  today.setHours(19, 0, 0, 0);
  const offsets = [-2, -1, 0, 1, 3, 5]; // days from today
  writeDb((db) => {
    const t = db.classes as Record<string, ClassSession>;
    for (const d of offsets) {
      const date = new Date(today);
      date.setDate(date.getDate() + d);
      const id = uid("cls");
      const status: ClassSession["status"] =
        d < 0 ? "completed" : d === 0 ? "scheduled" : "scheduled";
      t[id] = {
        id,
        studentId,
        teacherId,
        teacherName,
        startsAt: date.toISOString(),
        durationMin: 50,
        status,
        topic:
          d <= 0
            ? "Past tenses warm-up"
            : d === 1
              ? "Restaurant role-play"
              : "Business small talk",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        studentConfirmedAt: d < 0 ? date.toISOString() : undefined,
      };
    }
  });
}