/**
 * Acciones administrativas (mock): crear usuarios, asignar profesor a
 * estudiante, impersonar.
 *
 * @migration En backend (NestJS) cada función mapea a:
 *   - createUser  → POST /admin/users  (envía email de "set password")
 *   - assignTeacher → PATCH /admin/users/:studentId  { assignedTeacherId }
 *   - impersonate → POST /admin/users/:id/impersonate
 *       Devuelve un accessToken firmado con claim `actAs` + guarda en cookie
 *       `admin_original_session` para poder regresar.
 *   - Audit log: tabla `impersonation_logs (admin_id, target_id, started_at, ended_at)`.
 */
import type { AppRole, User, EnglishLevel } from "./types";
import { readDb, writeDb } from "./repository";
import { reloadCurrentUser } from "./auth";
import { adminApi } from "@/lib/api/endpoints";
import { refreshFromBackend } from "@/lib/api/bootstrap";

export interface CreateUserInput {
  fullName: string;
  email: string;
  role: Extract<AppRole, "student" | "teacher">;
  level?: EnglishLevel;
}

export async function createUserByAdmin(input: CreateUserInput): Promise<User> {
  const r = await adminApi.createUser({
    email: input.email.trim().toLowerCase(),
    fullName: input.fullName.trim(),
    role: input.role,
    level: input.level,
  });
  const user = r.user;
  writeDb((d) => {
    (d.users as Record<string, User>)[user.id] = user;
  });
  refreshFromBackend("admin");
  return user;
}

export interface UpdateUserInput {
  fullName?: string;
  email?: string;
  phone?: string;
  level?: EnglishLevel;
  roles?: AppRole[];
}

export async function updateUserByAdmin(id: string, patch: UpdateUserInput): Promise<User> {
  const db = readDb();
  const users = db.users as Record<string, User>;
  const existing = users[id];
  if (!existing) throw new Error("Usuario no encontrado");
  const updated = await adminApi.updateUser(id, {
    ...(patch.fullName !== undefined ? { fullName: patch.fullName.trim() } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
    ...(patch.level !== undefined ? { englishLevel: patch.level } : {}),
    ...(patch.roles && patch.roles[0] ? { role: patch.roles[0] as "student" | "teacher" | "admin" } : {}),
  });
  const next: User = {
    ...existing,
    ...(updated as any),
    roles: patch.roles ?? existing.roles,
  };
  writeDb((d) => {
    (d.users as Record<string, User>)[id] = next;
  });
  refreshFromBackend("admin");
  return next;
}

export async function setUserActive(id: string, active: boolean): Promise<User> {
  const db = readDb();
  const users = db.users as Record<string, User>;
  const existing = users[id];
  if (!existing) throw new Error("Usuario no encontrado");
  await adminApi.setUserStatus(id, !active);
  const next: User = {
    ...existing,
    disabledAt: active ? undefined : new Date().toISOString(),
  };
  writeDb((d) => {
    (d.users as Record<string, User>)[id] = next;
  });
  refreshFromBackend("admin");
  return next;
}

export async function softDeleteUser(id: string): Promise<void> {
  const db = readDb();
  const users = db.users as Record<string, User>;
  const existing = users[id];
  if (!existing) throw new Error("Usuario no encontrado");
  await adminApi.softDeleteUser(id);
  writeDb((d) => {
    (d.users as Record<string, User>)[id] = {
      ...existing,
      deletedAt: new Date().toISOString(),
      disabledAt: existing.disabledAt ?? new Date().toISOString(),
    };
  });
  refreshFromBackend("admin");
}

/**
 * Pide al backend un link de "set password" para el usuario. El backend
 * envía el email; devolvemos el link para que el admin pueda copiarlo.
 */
export async function resetUserPassword(
  id: string,
): Promise<{ tempPassword: string; setPasswordToken: string; link?: string }> {
  const r = await adminApi.resetPassword(id);
  return {
    tempPassword: "(enviada por email)",
    setPasswordToken: r.link ?? "",
    link: r.link,
  };
}

export async function assignTeacherToStudent(
  studentId: string,
  teacherId: string | null,
): Promise<User> {
  const db = readDb();
  const users = db.users as Record<string, User>;
  const student = users[studentId];
  if (!student) throw new Error("Estudiante no encontrado");
  if (!student.roles.includes("student"))
    throw new Error("Sólo los estudiantes pueden tener profesor asignado");
  if (teacherId) {
    const t = users[teacherId];
    if (!t || !t.roles.includes("teacher"))
      throw new Error("Profesor inválido");
  }
  await adminApi.assignTeacher(studentId, teacherId);
  const updated: User = { ...student, assignedTeacherId: teacherId ?? undefined };
  writeDb((d) => {
    (d.users as Record<string, User>)[studentId] = updated;
  });
  refreshFromBackend("admin");
  return updated;
}

/** Lista los estudiantes asignados a un profesor (mock helper). */
export function listAssignedStudents(teacherId: string): User[] {
  const db = readDb();
  const users = Object.values(db.users as Record<string, User>) as User[];
  return users.filter(
    (u) => u.roles.includes("student") && u.assignedTeacherId === teacherId,
  );
}

// ─── Impersonación (estado en memoria) ─────────────────────────────────
//
// El backend firma un nuevo access token con claim `actAs` cuando se llama a
// `POST /admin/users/:id/impersonate`. Aquí solo guardamos el estado en
// memoria para el banner y el flujo de "salir". Sin `localStorage`.

interface ImpersonationState {
  adminId: string;
  targetId: string;
  startedAt: string;
}

let impersonationState: ImpersonationState | null = null;
const impersonationListeners = new Set<() => void>();

export function getImpersonation(): ImpersonationState | null {
  return impersonationState;
}

export function onImpersonationChange(cb: () => void): () => void {
  impersonationListeners.add(cb);
  return () => impersonationListeners.delete(cb);
}

function notify() {
  for (const l of impersonationListeners) l();
}

export function startImpersonation(adminId: string, targetId: string) {
  impersonationState = { adminId, targetId, startedAt: new Date().toISOString() };
  notify();
}

/** Cierra impersonación local. El caller debe pedir refresh de sesión al backend. */
export function stopImpersonation(): string | null {
  const adminId = impersonationState?.adminId ?? null;
  impersonationState = null;
  notify();
  return adminId;
}