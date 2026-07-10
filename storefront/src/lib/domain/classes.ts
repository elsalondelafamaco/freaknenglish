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
import { classesApi, teachersApi } from "@/lib/api/endpoints";

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

export async function cancelClass(id: string): Promise<{ ok: boolean; reason?: string }> {
  const c = table()[id];
  if (c && !canModify(c)) {
    return {
      ok: false,
      reason: `No puedes cancelar con menos de ${RESCHEDULE_LOCK_HOURS}h de anticipación.`,
    };
  }
  try {
    const updated = await classesApi.cancel(id);
    writeDb((db) => {
      (db.classes as Record<string, ClassSession>)[id] = { ...(c ?? updated), status: "canceled" };
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

export async function rescheduleClass(
  id: string,
  newStartIso: string,
): Promise<{ ok: boolean; reason?: string }> {
  const c = table()[id];
  if (c && !canModify(c)) {
    return {
      ok: false,
      reason: `No puedes reprogramar con menos de ${RESCHEDULE_LOCK_HOURS}h de anticipación.`,
    };
  }
  const durationMin = c?.durationMin ?? 50;
  const endIso = new Date(new Date(newStartIso).getTime() + durationMin * 60_000).toISOString();
  try {
    await classesApi.reschedule(id, newStartIso, endIso);
    writeDb((db) => {
      const cur = (db.classes as Record<string, ClassSession>)[id];
      if (cur) (db.classes as Record<string, ClassSession>)[id] = { ...cur, startsAt: newStartIso };
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

export async function confirmAttendance(id: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    await classesApi.confirm(id);
    writeDb((db) => {
      const cur = (db.classes as Record<string, ClassSession>)[id];
      if (cur) {
        (db.classes as Record<string, ClassSession>)[id] = {
          ...cur,
          status: "completed",
          studentConfirmedAt: new Date().toISOString(),
        };
      }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
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
export async function teacherValidateAttendance(
  id: string,
  attended: boolean,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (attended) {
      await classesApi.validate(id);
    } else {
      await classesApi.cancel(id, "no_show");
    }
    writeDb((db) => {
      const cur = (db.classes as Record<string, ClassSession>)[id];
      if (cur) {
        (db.classes as Record<string, ClassSession>)[id] = {
          ...cur,
          status: attended ? "completed" : "missed",
          teacherValidatedAt: new Date().toISOString(),
        };
      }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
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

export async function addClassNote(input: {
  teacherId: string;
  studentId: string;
  classId?: string;
  body: string;
  rating?: number;
}): Promise<ClassNote> {
  if (!input.classId) throw new Error("Se requiere una clase para asociar la nota.");
  const saved = await teachersApi.addNote(input.classId, input.rating ?? 3, input.body.trim());
  const note: ClassNote = {
    id: saved?.id ?? uid("note"),
    teacherId: input.teacherId,
    studentId: input.studentId,
    classId: input.classId,
    body: input.body.trim(),
    rating: input.rating,
    createdAt: saved?.createdAt ?? new Date().toISOString(),
  };
  writeDb((db) => {
    (db.classNotes as Record<string, ClassNote>)[note.id] = note;
  });
  return note;
}

/** @deprecated los datos de clases vienen del backend; helper conservado como no-op. */
export function ensureDemoClasses(_studentId: string, _teacherId: string, _teacherName: string) {
  /* no-op — no seed demo data */
}