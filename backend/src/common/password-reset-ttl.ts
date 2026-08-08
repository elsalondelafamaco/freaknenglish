/**
 * Vigencia de los tokens de `password_resets`.
 *
 * El mismo mecanismo cubre dos situaciones muy distintas, y por eso el plazo
 * no puede ser único:
 *
 * - **Estrenar la cuenta**: quien todavía no tiene contraseña recibe un enlace
 *   que ES su invitación. Tiene que aguantar a que revise el correo con calma
 *   —puede llegarle un viernes y abrirlo el lunes—, así que dura una semana.
 * - **Restablecer**: quien ya tiene contraseña pide un enlace que da acceso a
 *   una cuenta viva. Dura poco a propósito: si el buzón se filtra o queda
 *   abierto en un equipo compartido, la ventana de riesgo es de minutos, no de
 *   días.
 *
 * Antes ambos casos usaban el plazo corto, así que a un estudiante que no
 * alcanzaba a usar su invitación y pedía otro enlace le vencía en una hora.
 */

/** Cuenta sin contraseña: el enlace es la invitación. */
export const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7

/** Cuenta con contraseña, autoservicio ("¿Olvidaste tu contraseña?"). */
export const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60

/** Cuenta con contraseña, generado por un admin desde la ficha del usuario. */
export const ADMIN_RESET_TTL_MS = 1000 * 60 * 60 * 24

/**
 * Plazo que corresponde a este usuario. `tienePassword` decide: sin contraseña
 * es una invitación; con contraseña, un restablecimiento.
 */
export function resetTtlMs(tienePassword: boolean, ttlSiTienePassword: number): number {
  return tienePassword ? ttlSiTienePassword : INVITE_TTL_MS
}

/** Texto para el correo, para que el plazo que se promete sea el real. */
export function ttlLabel(ms: number): string {
  const horas = Math.round(ms / (1000 * 60 * 60))
  if (horas >= 24) {
    const dias = Math.round(horas / 24)
    return dias === 1 ? '1 día' : `${dias} días`
  }
  return horas === 1 ? '1 hora' : `${horas} horas`
}
