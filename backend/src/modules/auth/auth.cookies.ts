/**
 * Nombres y ruta de las cookies de sesión, en un sitio.
 *
 * La ruta importa: el navegador sólo manda estas cookies a `/api/v1/auth/*`,
 * así que no viajan en cada petición de la app. Las escriben tanto el módulo
 * de auth como el de admin (al empezar una suplantación), y tenían que
 * coincidir exactamente o `clearCookie` no borraría nada.
 */
export const AUTH_COOKIE_PATH = '/api/v1/auth'
export const REFRESH_COOKIE = 'refresh_token'
export const IMPERSONATION_COOKIE = 'freakn_imp'
