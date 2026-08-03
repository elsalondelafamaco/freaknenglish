import { AppRole, Prisma } from '@prisma/client'

/**
 * Multi-rol: `role` es el rol principal (define a dónde entra el usuario al
 * loguearse) y `extraRoles` suma capacidades. El caso real es "un admin que
 * también da clases": queda role=admin + extraRoles=[teacher] y aparece en los
 * listados de profesores sin necesidad de una segunda cuenta.
 *
 * Regla única: los permisos SIEMPRE se evalúan sobre `rolesOf()`, nunca sobre
 * `user.role` a secas.
 */

export type WithRoles = { role: AppRole; extraRoles?: AppRole[] | null }

/** Roles efectivos (principal + extras), sin repetidos. */
export function rolesOf(user: WithRoles): AppRole[] {
  return [...new Set<AppRole>([user.role, ...(user.extraRoles ?? [])])]
}

/** ¿El usuario tiene este rol, sea el principal o uno extra? */
export function hasRole(user: WithRoles, role: AppRole): boolean {
  return user.role === role || (user.extraRoles ?? []).includes(role)
}

/**
 * Filtro Prisma para "es profesor". Reemplaza a `{ role: 'teacher' }`, que
 * dejaba fuera a los admin que además dan clases.
 */
export const IS_TEACHER: Prisma.UserWhereInput = {
  OR: [{ role: 'teacher' }, { extraRoles: { has: 'teacher' } }],
}

/** Igual que `IS_TEACHER` pero solo profesores activos (no baneados ni borrados). */
export const IS_ACTIVE_TEACHER: Prisma.UserWhereInput = {
  ...IS_TEACHER,
  disabledAt: null,
  deletedAt: null,
}
