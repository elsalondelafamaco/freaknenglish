/**
 * Inline-styled HTML email templates (Resend-compatible).
 *
 * Todo el branding (nombre, colores, logo, correo de soporte, URL pública) sale
 * de variables de entorno vía `env` — no hay strings hardcodeados fuera de esta
 * capa. Para probar con tu propia marca basta con setear en `backend/.env`:
 *
 *   RESEND_API_KEY=re_xxx
 *   RESEND_FROM="Mi Marca <hola@midominio.com>"
 *   RESEND_REPLY_TO=soporte@midominio.com
 *   BRAND_NAME="Mi Marca"
 *   BRAND_TAGLINE="Inglés 1 a 1"
 *   BRAND_COLOR=#FEF6C7            # fondo del email
 *   BRAND_INK=#0A0A0A              # tipografía principal
 *   BRAND_ACCENT=#0A0A0A           # color del CTA
 *   BRAND_LOGO_URL=https://mi.cdn/logo.png
 *   BRAND_SUPPORT_EMAIL=soporte@midominio.com
 *   PUBLIC_SITE_URL=https://mi-app.com
 *
 * Los templates existentes siguen funcionando aunque no configures nada:
 * se usan los defaults declarados en `config/env.ts`.
 */
import { env } from '../../config/env'

function cta(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;background:${env.BRAND_ACCENT};color:#fff;text-decoration:none;padding:12px 20px;border-radius:14px;font-weight:600;margin-top:16px">${label}</a>`
}

function wrap(title: string, body: string, opts: { preheader?: string } = {}) {
  const logo = env.BRAND_LOGO_URL
    ? `<img src="${env.BRAND_LOGO_URL}" alt="${env.BRAND_NAME}" style="height:36px;margin-bottom:16px" />`
    : `<div style="font-weight:800;font-size:20px;margin-bottom:16px;color:${env.BRAND_INK}">${env.BRAND_NAME}</div>`
  const support = env.BRAND_SUPPORT_EMAIL
    ? `<p style="margin-top:8px;font-size:12px;color:#666">¿Dudas? Escríbenos a <a href="mailto:${env.BRAND_SUPPORT_EMAIL}" style="color:${env.BRAND_INK}">${env.BRAND_SUPPORT_EMAIL}</a></p>`
    : ''
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${opts.preheader}</div>`
    : ''
  return `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;background:${env.BRAND_COLOR};padding:24px;color:${env.BRAND_INK};margin:0">
  ${preheader}
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:24px;padding:32px">
    ${logo}
    <h1 style="font-size:24px;margin:0 0 12px;color:${env.BRAND_INK}">${title}</h1>
    ${body}
    ${support}
    <p style="margin-top:24px;font-size:12px;color:#888">${env.BRAND_NAME} · ${env.BRAND_TAGLINE}</p>
  </div>
</body></html>`
}

const money = (cents: number, currency = 'COP') =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100)

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { dateStyle: 'full', timeStyle: 'short' })

export const templates = {
  welcome: (v: { fullName: string }) =>
    wrap(
      `¡Bienvenido, ${v.fullName}!`,
      `<p>Tu cuenta en ${env.BRAND_NAME} está lista.</p>${cta(`${env.PUBLIC_SITE_URL}/app`, 'Entrar a mi cuenta')}`,
      { preheader: 'Tu cuenta está activa' },
    ),

  /**
   * EJEMPLO COMPLETO — usa todas las capacidades del wrapper:
   * marca, preheader, CTA y datos dinámicos vía `vars`.
   */
  payment_success: (v: { fullName: string; planName: string; amountInCents: number; currency: string; reference: string }) =>
    wrap(
      `Pago confirmado`,
      `<p>Hola ${v.fullName}, recibimos tu pago del plan <b>${v.planName}</b>.</p>
       <table style="width:100%;font-size:14px;margin:16px 0;border-collapse:collapse">
         <tr><td style="padding:6px 0;color:#666">Monto</td><td style="text-align:right"><b>${money(v.amountInCents, v.currency)}</b></td></tr>
         <tr><td style="padding:6px 0;color:#666">Referencia</td><td style="text-align:right;font-family:monospace">${v.reference}</td></tr>
       </table>
       <p>Ya puedes agendar tus clases desde tu panel.</p>
       ${cta(`${env.PUBLIC_SITE_URL}/app`, 'Agendar mi primera clase')}`,
      { preheader: `Pago por ${money(v.amountInCents, v.currency)} confirmado` },
    ),

  reminder_24h: (v: { startsAt: string }) =>
    wrap('Tu clase es mañana', `<p>Te esperamos el <b>${fmtDate(v.startsAt)}</b>.</p>${cta(`${env.PUBLIC_SITE_URL}/app/calendar`, 'Ver mi calendario')}`),

  reminder_1h: () =>
    wrap('Tu clase comienza en 1 hora', `<p>¡Prepárate! Entra 5 minutos antes.</p>${cta(`${env.PUBLIC_SITE_URL}/app`, 'Ir a mi clase')}`),

  class_rescheduled: (v: { startsAt: string }) =>
    wrap('Tu clase fue reprogramada', `<p>Nueva fecha: <b>${fmtDate(v.startsAt)}</b>.</p>${cta(`${env.PUBLIC_SITE_URL}/app/calendar`, 'Ver calendario')}`),

  class_cancelled: (v: { reason?: string }) =>
    wrap('Tu clase fue cancelada', `<p>${v.reason ? `Motivo: ${v.reason}` : 'La clase fue cancelada.'}</p>${cta(`${env.PUBLIC_SITE_URL}/app/calendar`, 'Reagendar')}`),

  teacher_assigned: (v: { teacherName: string }) =>
    wrap('Tienes un nuevo profesor', `<p>Fuiste asignado con <b>${v.teacherName}</b>. Ya puedes ver tus clases.</p>${cta(`${env.PUBLIC_SITE_URL}/app`, 'Ver mi horario')}`),

  abandoned_cart: (v: { planName: string }) =>
    wrap('Tu plan te está esperando', `<p>Completa tu inscripción al plan <b>${v.planName}</b>.</p>${cta(`${env.PUBLIC_SITE_URL}/checkout`, 'Completar inscripción')}`),

  nps_monthly: () =>
    wrap('¿Cómo vamos?', `<p>Cuéntanos del 0 al 10.</p>${cta(`${env.PUBLIC_SITE_URL}/app/settings`, 'Dejar mi opinión')}`),

  renewal_3d: () =>
    wrap('Tu plan se renueva en 3 días', `<p>Puedes gestionarlo desde tu portal.</p>${cta(`${env.PUBLIC_SITE_URL}/app/settings`, 'Gestionar plan')}`),

  // ─── Password / cuentas ─────────────────────────────────────────────
  password_reset: (v: { link: string }) =>
    wrap(
      'Restablece tu contraseña',
      `<p>Recibimos una solicitud para restablecer tu contraseña. El enlace vence pronto por seguridad.</p>
       <p>Si no fuiste tú, ignora este correo.</p>
       ${cta(v.link, 'Crear nueva contraseña')}`,
      { preheader: 'Enlace para restablecer tu contraseña' },
    ),

  account_invite: (v: { fullName: string; link: string }) =>
    wrap(
      `Te damos la bienvenida, ${v.fullName}`,
      `<p>Se creó una cuenta para ti en ${env.BRAND_NAME}. Configura tu contraseña para ingresar.</p>
       ${cta(v.link, 'Configurar mi contraseña')}`,
      { preheader: 'Configura tu contraseña para ingresar' },
    ),

  // ─── Retención / ciclo de vida ──────────────────────────────────────
  payment_failed: (v: { fullName?: string; planName?: string }) =>
    wrap(
      'No pudimos procesar tu pago',
      `<p>${v.fullName ? `Hola ${v.fullName}, ` : ''}tu pago${v.planName ? ` del plan <b>${v.planName}</b>` : ''} no se pudo procesar. Para no perder el acceso a tus clases, actualiza tu método de pago.</p>
       ${cta(`${env.PUBLIC_SITE_URL}/app/settings`, 'Actualizar método de pago')}`,
      { preheader: 'Actualiza tu método de pago para no perder el acceso' },
    ),

  level_up: (v: { level: string }) =>
    wrap(
      '¡Felicitaciones, subiste de nivel! 🎉',
      `<p>Aprobaste tu checkpoint y avanzaste al nivel <b>${v.level}</b>. Ya tienes desbloqueados los nuevos módulos.</p>
       ${cta(`${env.PUBLIC_SITE_URL}/app/learning`, 'Ver mis nuevos módulos')}`,
      { preheader: '¡Subiste de nivel!' },
    ),
} as const

export type TemplateKey = keyof typeof templates
