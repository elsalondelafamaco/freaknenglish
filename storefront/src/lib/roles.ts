import type { AppRole } from "@/lib/domain/types";

/**
 * Multi-rol en el cliente. El backend guarda `role` (principal) + `extraRoles`,
 * así que preguntar por `u.role === "teacher"` deja fuera al admin que también
 * da clases. Estas dos funciones son la forma correcta de preguntar.
 */

type RawUser = { role?: string | null; extraRoles?: string[] | null };

/** Roles efectivos de una fila cruda del backend (`/admin/users`, etc.). */
export function rolesOfRow(u: RawUser): AppRole[] {
  return [...new Set([u.role, ...(u.extraRoles ?? [])].filter(Boolean))] as AppRole[];
}

/** ¿Esta fila tiene el rol, sea el principal o uno extra? */
export function rowHasRole(u: RawUser, role: AppRole): boolean {
  return rolesOfRow(u).includes(role);
}
