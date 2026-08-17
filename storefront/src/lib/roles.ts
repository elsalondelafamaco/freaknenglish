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

/**
 * Portal que le corresponde a estos roles.
 *
 * Existe porque varios enlaces mandaban a `/app` a todo el mundo (el botón
 * "Hola, {nombre}" de la home, entre otros) y un profesor terminaba en el
 * dashboard del estudiante viendo "Aún no tienes un plan activo" — con el
 * menú de profe al lado. El orden importa: admin manda sobre profe, y profe
 * sobre estudiante.
 */
export function homePathFor(roles: readonly AppRole[] | undefined | null): string {
  if (roles?.includes("admin")) return "/admin";
  if (roles?.includes("teacher")) return "/teacher";
  return "/app";
}
