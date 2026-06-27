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
import type { ClassNote, ClassSession, User } from "./types";
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

// ===========================================================================
// Fase 5 — Helpers para el portal de profesores
// ===========================================================================

export function listClassesForTeacher(teacherId: string): ClassSession[] {
  return Object.values(table())
    .filter((c) => c.teacherId === teacherId)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function teacherTodayClasses(teacherId: string): ClassSession[] {
  const today = new Date().toISOString().slice(0, 10);
  return listClassesForTeacher(teacherId).filter(
    (c) => c.startsAt.startsWith(today) && c.status !== "canceled",
  );
}

export function teacherUpcoming(teacherId: string): ClassSession[] {
  const now = Date.now();
  return listClassesForTeacher(teacherId).filter(
    (c) => c.status === "scheduled" && new Date(c.startsAt).getTime() >= now,
  );
}

/** Cross-check del profesor sobre la asistencia del estudiante. */
export function teacherValidateAttendance(
  id: string,
  attended: boolean,
): { ok: boolean; reason?: string } {
  const c = table()[id];
  if (!c) return { ok: false, reason: "Clase no encontrada." };
  writeDb((db) => {
    (db.classes as Record<string, ClassSession>)[id] = {
      ...c,
      status: attended ? "completed" : "missed",
      teacherValidatedAt: new Date().toISOString(),
    };
  });
  return { ok: true };
}

/** Estudiantes únicos asignados a un profesor (derivado de las clases). */
export function listStudentsOfTeacher(teacherId: string): Array<{
  student: User;
  totalClasses: number;
  completed: number;
  missed: number;
  nextClass?: ClassSession;
}> {
  const db = readDb();
  const users = db.users as Record<string, User>;
  const classes = listClassesForTeacher(teacherId);
  const byStudent = new Map<string, ClassSession[]>();
  for (const c of classes) {
    const arr = byStudent.get(c.studentId) ?? [];
    arr.push(c);
    byStudent.set(c.studentId, arr);
  }
  const now = Date.now();
  const rows = [];
  for (const [studentId, list] of byStudent) {
    const student = users[studentId];
    if (!student) continue;
    rows.push({
      student,
      totalClasses: list.length,
      completed: list.filter((c) => c.status === "completed").length,
      missed: list.filter((c) => c.status === "missed").length,
      nextClass: list.find(
        (c) => c.status === "scheduled" && new Date(c.startsAt).getTime() >= now,
      ),
    });
  }
  return rows.sort((a, b) => a.student.fullName.localeCompare(b.student.fullName));
}

// ===========================================================================
// Notas del profesor
// ===========================================================================

function notesTable(): Record<string, ClassNote> {
  return readDb().classNotes as Record<string, ClassNote>;
}

export function listNotesForStudent(studentId: string, teacherId?: string): ClassNote[] {
  return Object.values(notesTable())
    .filter((n) => n.studentId === studentId && (!teacherId || n.teacherId === teacherId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addClassNote(input: {
  teacherId: string;
  studentId: string;
  classId?: string;
  body: string;
  rating?: number;
}): ClassNote {
  const note: ClassNote = {
    id: uid("note"),
    teacherId: input.teacherId,
    studentId: input.studentId,
    classId: input.classId,
    body: input.body.trim(),
    rating: input.rating,
    createdAt: new Date().toISOString(),
  };
  writeDb((db) => {
    (db.classNotes as Record<string, ClassNote>)[note.id] = note;
  });
  return note;
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