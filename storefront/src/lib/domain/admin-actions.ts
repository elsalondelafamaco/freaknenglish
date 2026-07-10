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
  return user;
}

export interface UpdateUserInput {
  fullName?: string;
  email?: string;
  phone?: string;
  level?: EnglishLevel;
  roles?: AppRole[];
}

export function updateUserByAdmin(id: string, patch: UpdateUserInput): User {
  const db = readDb();
  const users = db.users as Record<string, User>;
  const existing = users[id];
  if (!existing) throw new Error("Usuario no encontrado");
  const next: User = {
    ...existing,
    ...(patch.fullName !== undefined ? { fullName: patch.fullName.trim() } : {}),
    ...(patch.email !== undefined ? { email: patch.email.trim().toLowerCase() } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
    ...(patch.level !== undefined ? { level: patch.level } : {}),
    ...(patch.roles !== undefined && patch.roles.length > 0 ? { roles: patch.roles } : {}),
  };
  writeDb((d) => {
    (d.users as Record<string, User>)[id] = next;
    if (patch.email && patch.email !== existing.email) {
      const pw = d.meta.passwordsByEmail[existing.email];
      delete d.meta.passwordsByEmail[existing.email];
      d.meta.passwordsByEmail[next.email] = pw ?? "Freakn123!";
    }
  });
  return next;
}

export function setUserActive(id: string, active: boolean): User {
  const db = readDb();
  const users = db.users as Record<string, User>;
  const existing = users[id];
  if (!existing) throw new Error("Usuario no encontrado");
  const next: User = {
    ...existing,
    disabledAt: active ? undefined : new Date().toISOString(),
  };
  writeDb((d) => {
    (d.users as Record<string, User>)[id] = next;
  });
  return next;
}

export function softDeleteUser(id: string): void {
  const db = readDb();
  const users = db.users as Record<string, User>;
  const existing = users[id];
  if (!existing) throw new Error("Usuario no encontrado");
  writeDb((d) => {
    (d.users as Record<string, User>)[id] = {
      ...existing,
      deletedAt: new Date().toISOString(),
      disabledAt: existing.disabledAt ?? new Date().toISOString(),
    };
  });
}

/**
 * Resetea la contraseña en el mock a una temporal y devuelve el "set-password
 * token" simulado para mostrarlo al admin (en backend, se envía por email).
 */
export function resetUserPassword(id: string): { tempPassword: string; setPasswordToken: string } {
  const db = readDb();
  const users = db.users as Record<string, User>;
  const existing = users[id];
  if (!existing) throw new Error("Usuario no encontrado");
  const tempPassword = "Freakn" + Math.random().toString(36).slice(2, 6) + "!";
  const setPasswordToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
  writeDb((d) => {
    d.meta.passwordsByEmail[existing.email] = tempPassword;
  });
  return { tempPassword, setPasswordToken };
}

export function assignTeacherToStudent(
  studentId: string,
  teacherId: string | null,
): User {
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
  const updated: User = { ...student, assignedTeacherId: teacherId ?? undefined };
  writeDb((d) => {
    (d.users as Record<string, User>)[studentId] = updated;
  });
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