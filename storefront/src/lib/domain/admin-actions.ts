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

export interface CreateUserInput {
  fullName: string;
  email: string;
  role: Extract<AppRole, "student" | "teacher">;
  level?: EnglishLevel;
}

export function createUserByAdmin(input: CreateUserInput): User {
  const email = input.email.trim().toLowerCase();
  const db = readDb();
  const users = db.users as Record<string, User>;
  const existing = Object.values(users).find((u) => u.email === email);
  if (existing && !existing.deletedAt) throw new Error("Ya existe un usuario con ese email.");
  const id = `usr_${Math.random().toString(36).slice(2, 10)}`;
  const user: User = {
    id,
    email,
    fullName: input.fullName.trim(),
    roles: [input.role],
    level: input.role === "student" ? (input.level ?? "beginner") : undefined,
    createdAt: new Date().toISOString(),
  };
  writeDb((d) => {
    (d.users as Record<string, User>)[id] = user;
    // Password temporal; en backend se envía email para que el usuario la setee.
    d.meta.passwordsByEmail[email] = "Freakn123!";
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

// ─── Impersonación ───────────────────────────────────────────────────────

const IMPERSONATION_KEY = "freakn.impersonation.v1";
const SAVED_ADMIN_KEY = "freakn.me.original.v1";

interface ImpersonationState {
  adminId: string;
  targetId: string;
  startedAt: string;
}

export function getImpersonation(): ImpersonationState | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(IMPERSONATION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ImpersonationState;
  } catch {
    return null;
  }
}

/**
 * Inicia impersonación. Guarda el id del admin original y reemplaza `me`
 * por el usuario destino. El AuthProvider lo refresca al volver a la app.
 */
export function startImpersonation(adminId: string, targetId: string) {
  if (typeof localStorage === "undefined") return;
  const state: ImpersonationState = {
    adminId,
    targetId,
    startedAt: new Date().toISOString(),
  };
  localStorage.setItem(IMPERSONATION_KEY, JSON.stringify(state));
  localStorage.setItem(SAVED_ADMIN_KEY, adminId);
  localStorage.setItem("freakn.me.v2", targetId);
  try {
    window.dispatchEvent(
      new StorageEvent("storage", { key: "freakn.me.v2", newValue: targetId }),
    );
  } catch {
    /* no-op */
  }
}

/** Finaliza impersonación y restaura al admin original. */
export function stopImpersonation(): string | null {
  if (typeof localStorage === "undefined") return null;
  const adminId = localStorage.getItem(SAVED_ADMIN_KEY);
  localStorage.removeItem(IMPERSONATION_KEY);
  localStorage.removeItem(SAVED_ADMIN_KEY);
  if (adminId) localStorage.setItem("freakn.me.v2", adminId);
  try {
    window.dispatchEvent(
      new StorageEvent("storage", { key: "freakn.me.v2", newValue: adminId }),
    );
  } catch {
    /* no-op */
  }
  return adminId;
}