/**
 * Normaliza un correo para buscarlo o guardarlo.
 *
 * Existe porque esto estaba a medias y costó cuentas: el registro guardaba en
 * minúsculas pero el login buscaba tal cual se escribía, así que una mayúscula
 * daba "credenciales inválidas". Peor en el acceso con Google, que si no
 * encuentra CREA la cuenta: una diferencia de mayúsculas dejaba un usuario
 * duplicado, sin plan ni profesor.
 *
 * Úsalo en TODA búsqueda y TODA alta por correo, sin excepciones.
 */
export function normalizarEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}
