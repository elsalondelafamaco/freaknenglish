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
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px auto 4px"><tr><td style="background:${env.BRAND_ACCENT};border-radius:999px">
    <a href="${href}" style="display:inline-block;color:#fff;text-decoration:none;padding:14px 28px;font-weight:700;font-size:15px">${label}</a>
  </td></tr></table>`
}

function wrap(title: string, body: string, opts: { preheader?: string } = {}) {
  const logo = env.BRAND_LOGO_URL
    ? `<img src="${env.BRAND_LOGO_URL}" alt="${env.BRAND_NAME}" height="40" style="height:40px;display:block;margin:0 auto" />`
    : `<div style="font-weight:800;font-size:22px;color:${env.BRAND_INK};text-align:center">${env.BRAND_NAME}</div>`
  const support = env.BRAND_SUPPORT_EMAIL
    ? `¿Dudas? Escríbenos a <a href="mailto:${env.BRAND_SUPPORT_EMAIL}" style="color:${env.BRAND_INK};font-weight:600">${env.BRAND_SUPPORT_EMAIL}</a> — respondemos rápido.`
    : 'Responde este correo si necesitas ayuda — lo leemos de verdad.'
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${opts.preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
    : ''
  const year = new Date().getFullYear()
  return `<!doctype html><html lang="es"><body style="font-family:'Segoe UI',system-ui,Arial,sans-serif;background:${env.BRAND_COLOR};padding:0;margin:0;color:${env.BRAND_INK}">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${env.BRAND_COLOR};padding:32px 16px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
      <tr><td style="padding:0 0 20px;text-align:center">
        <a href="${env.PUBLIC_SITE_URL}" style="text-decoration:none">${logo}</a>
      </td></tr>
      <tr><td style="background:#ffffff;border-radius:24px;padding:36px 32px;text-align:left">
        <h1 style="font-size:24px;line-height:1.25;margin:0 0 14px;color:${env.BRAND_INK}">${title}</h1>
        <div style="font-size:15px;line-height:1.65;color:#333">${body}</div>
      </td></tr>
      <tr><td style="padding:20px 24px;text-align:center">
        <p style="margin:0;font-size:12px;color:#8a8a8a;line-height:1.6">${support}</p>
        <p style="margin:8px 0 0;font-size:12px;color:#aaa">${env.BRAND_NAME} · ${env.BRAND_TAGLINE} · © ${year}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`
}

const money = (cents: number, currency = 'COP') =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100)

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { dateStyle: 'full', timeStyle: 'short' })

export const templates = {
  /**
   * Registro SIN plan (formulario de signup). El objetivo del correo es que
   * vuelva y elija plan: no promete clases que todavía no tiene.
   */
  welcome_signup: (v: { fullName: string }) =>
    wrap(
      `¡Hola ${String(v.fullName ?? '').split(' ')[0] || ''}! Tu cuenta ya está creada 👋`,
      `<p>Bienvenido a ${env.BRAND_NAME}. Ya tienes cuenta, y falta un solo paso para empezar a hablar inglés: <b>elegir tu plan y tu horario</b>.</p>
       <p>Así funciona:</p>
       <p style="margin:4px 0">1️⃣ &nbsp;Eliges el plan que se ajusta a tu ritmo</p>
       <p style="margin:4px 0">2️⃣ &nbsp;Escoges los horarios fijos que te sirven cada semana</p>
       <p style="margin:4px 0">3️⃣ &nbsp;Te asignamos tu profe y arrancas tus clases 1 a 1 en vivo</p>
       ${cta(`${env.PUBLIC_SITE_URL}/#precios`, 'Elegir mi plan')}
       <p style="font-size:13px;color:#888;margin-top:16px">¿Dudas antes de decidir? Respóndenos este correo o escríbenos por WhatsApp — te ayudamos a escoger. 💛</p>`,
      { preheader: 'Solo falta elegir tu plan y tu horario' },
    ),

  /**
   * Registro CON plan (viene del checkout, ya pagó). Aquí sí se le da la
   * bienvenida completa y se le dice qué sigue con sus clases.
   */
  welcome_plan: (v: { fullName: string; planName?: string; schedule?: string }) =>
    wrap(
      `¡Bienvenido a ${env.BRAND_NAME}, ${String(v.fullName ?? '').split(' ')[0] || ''}! 🎉`,
      `<p>Tu pago quedó confirmado${v.planName ? ` y tu <b>${v.planName}</b> ya está activo` : ' y tu plan ya está activo'}. Desde hoy no memorizas inglés: <b>lo hablas</b>.</p>
       ${v.schedule ? `<p>Tu horario: <b>${v.schedule}</b></p>` : ''}
       <p>Esto es lo que sigue:</p>
       <p style="margin:4px 0">🧑‍🏫 &nbsp;Te asignamos tu profe y te avisamos por correo</p>
       <p style="margin:4px 0">📅 &nbsp;Tus clases aparecen en tu calendario</p>
       <p style="margin:4px 0">📚 &nbsp;Mientras tanto, ya puedes entrar a tus módulos</p>
       ${cta(`${env.PUBLIC_SITE_URL}/app`, 'Entrar a mi portal')}
       <p style="font-size:13px;color:#888;margin-top:16px">Tip: llega a tu primera clase con ganas de hablar, aunque te equivoques. Así es como se aprende. 💛</p>`,
      { preheader: 'Tu plan está activo — esto es lo que sigue' },
    ),

  welcome: (v: { fullName: string }) =>
    wrap(
      `¡Bienvenido a ${env.BRAND_NAME}, ${v.fullName}! 🎉`,
      `<p>Desde hoy no memorizas inglés: <b>lo hablas</b>. Clases 1 a 1 en vivo, a tu ritmo y con tu propio profesor.</p>
       <p>Esto es lo que te espera en tu portal:</p>
       <p style="margin:4px 0">📅 &nbsp;Tu calendario con tus clases fijas de la semana</p>
       <p style="margin:4px 0">📚 &nbsp;Módulos y prácticas para avanzar entre clases</p>
       <p style="margin:4px 0">🧑‍🏫 &nbsp;Un aula colaborativa en vivo con tu profesor</p>
       ${cta(`${env.PUBLIC_SITE_URL}/app`, 'Entrar a mi portal')}
       <p style="font-size:13px;color:#888;margin-top:16px">Tip: guarda este correo — tu primera clase es el mejor momento para empezar a hablar sin miedo. 💛</p>`,
      { preheader: 'Tu cuenta está lista — esto es lo que sigue' },
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

  // Acepta `startsAt` (ISO) o `newDate` (texto ya formateado) — distintos
  // callers usan uno u otro; antes esto producía "Invalid Date" en el correo.
  class_rescheduled: (v: { startsAt?: string; newDate?: string; fullName?: string }) => {
    const when = v.newDate ?? (v.startsAt ? fmtDate(v.startsAt) : '')
    return wrap(
      'Tu clase fue reprogramada',
      `<p>${v.fullName ? `Hola ${String(v.fullName).split(' ')[0]}, tu` : 'Tu'} clase cambió de horario.</p>
       ${when ? `<p>Nueva fecha: <b>${when}</b>.</p>` : '<p>Revisa tu calendario para ver el nuevo horario.</p>'}
       ${cta(`${env.PUBLIC_SITE_URL}/app/calendar`, 'Ver calendario')}`,
      { preheader: when ? `Nueva fecha: ${when}` : 'Revisa tu nuevo horario' },
    )
  },

  // Clase congelada: se avisa que hay que moverla aunque todavía no haya fecha.
  // Sin este correo el estudiante veía la clase desaparecer de su horario sin
  // ninguna explicación.
  class_pending_reschedule: (v: { fullName?: string; reason?: string }) =>
    wrap(
      'Tu clase se va a reprogramar',
      `<p>${v.fullName ? `Hola ${String(v.fullName).split(' ')[0]}, tu` : 'Tu'} profe necesita mover una de tus clases.</p>
       ${v.reason ? `<p>Motivo: <b>${v.reason}</b></p>` : ''}
       <p>Todavía no hay fecha nueva: tu profe te confirma el horario muy pronto.
       <b>No pierdes la clase</b> — queda guardada hasta que se reprograme.</p>
       ${cta(`${env.PUBLIC_SITE_URL}/app/calendar`, 'Ver mi calendario')}`,
      { preheader: 'Tu profe te confirma la nueva fecha muy pronto' },
    ),

  checkpoint_unlocked: (v: { fullName?: string; checkpoint?: string }) =>
    wrap(
      '¡Tu checkpoint está listo!',
      `<p>${v.fullName ? `${String(v.fullName).split(' ')[0]}, tu` : 'Tu'} profe habilitó tu checkpoint${v.checkpoint ? `: <b>${v.checkpoint}</b>` : ''}.</p>
       <p>Es tu momento de demostrar lo que aprendiste. Tómate tu tiempo, respira y dale con toda —
       al superarlo se desbloquea el siguiente tramo del programa.</p>
       ${cta(`${env.PUBLIC_SITE_URL}/app/learning`, 'Presentar mi checkpoint')}`,
      { preheader: 'Tu profe habilitó tu checkpoint' },
    ),

  class_cancelled: (v: { reason?: string }) =>
    wrap('Tu clase fue cancelada', `<p>${v.reason ? `Motivo: ${v.reason}` : 'La clase fue cancelada.'}</p>${cta(`${env.PUBLIC_SITE_URL}/app/calendar`, 'Reagendar')}`),

  teacher_assigned: (v: { teacherName: string; schedule?: string }) =>
    wrap(
      '¡Ya tienes profe! 🎉',
      `<p>Te presentamos a <b>${v.teacherName}</b>, tu nuevo teacher 1 a 1. A partir de ahora estará contigo en cada clase, enfocado 100% en que hables inglés con confianza.</p>
       ${v.schedule ? `<p>Tu horario de clases: <b>${v.schedule}</b>.</p>` : ''}
       <p>Ya puedes ver tus próximas clases en tu calendario. ¡Nos vemos en clase!</p>
       ${cta(`${env.PUBLIC_SITE_URL}/app/calendar`, 'Ver mis clases')}`,
      { preheader: `Tu teacher es ${v.teacherName} — revisa tu calendario` },
    ),

  student_assigned: (v: { studentName: string; schedule?: string }) =>
    wrap(
      'Tienes un nuevo estudiante 🎓',
      `<p><b>${v.studentName}</b> acaba de ser asignado contigo.</p>
       ${v.schedule ? `<p>Su horario semanal: <b>${v.schedule}</b>.</p>` : ''}
       <p>Revisa su perfil y prepara su primera clase — la primera impresión hace la diferencia.</p>
       ${cta(`${env.PUBLIC_SITE_URL}/teacher/students`, 'Ver mi estudiante')}`,
      { preheader: `${v.studentName} fue asignado contigo` },
    ),

  student_unassigned: (v: { studentName: string }) =>
    wrap(
      'Baja de estudiante',
      `<p><b>${v.studentName}</b> ya no está asignado contigo. Sus franjas quedaron liberadas en tu agenda.</p>
       <p>Si tienes dudas sobre este cambio, escríbele al equipo admin.</p>
       ${cta(`${env.PUBLIC_SITE_URL}/teacher/schedule`, 'Ver mi agenda')}`,
      { preheader: `${v.studentName} salió de tu agenda` },
    ),

  abandoned_cart: (v: { planName: string; fullName?: string }) =>
    wrap(
      'Tu cupo sigue disponible 💛',
      `<p>${v.fullName ? `Hola ${v.fullName}, vimos` : 'Vimos'} que empezaste tu inscripción al plan <b>${v.planName}</b> y quedó a un paso de completarse.</p>
       <p>Los horarios con inicio inmediato son los primeros en llenarse — retoma donde quedaste y asegura el tuyo en menos de 2 minutos.</p>
       ${cta(`${env.PUBLIC_SITE_URL}/checkout`, 'Retomar mi inscripción')}
       <p style="font-size:13px;color:#888;margin-top:16px">¿Tuviste un problema con el pago o una duda del plan? Responde este correo y te ayudamos al instante.</p>`,
      { preheader: 'Quedaste a un paso — tu horario aún está libre' },
    ),

  class_reported: (v: { studentName: string; teacherName: string; when: string; note: string }) =>
    wrap(
      '⚠️ Un estudiante reportó una clase',
      `<p><b>${v.studentName}</b> reportó un problema con su clase del <b>${v.when}</b> (profe: ${v.teacherName}).</p>
       <blockquote style="margin:12px 0;padding:10px 14px;background:#FEF6C7;border-radius:10px;font-style:italic">${v.note}</blockquote>
       <p>Revísalo y contáctalo lo antes posible.</p>`,
      { preheader: `${v.studentName}: "${v.note.slice(0, 60)}"` },
    ),

  class_no_show: (v: { fullName?: string; nextClass?: string }) =>
    wrap(
      'Te extrañamos en tu clase 💛',
      `<p>${v.fullName ? `Hola ${v.fullName}, tu` : 'Tu'} profe te esperó con la clase lista, pero esta vez no pudiste conectarte — ¡tranqui, a cualquiera le pasa!</p>
       <p>Cada clase es un paso más cerca de hablar inglés con confianza, y tu progreso se construye con constancia. ${v.nextClass ? `Tu próxima clase es el <b>${v.nextClass}</b> — ` : ''}te esperamos con toda la energía. 💪</p>
       <p>Si tuviste un inconveniente con el horario, escríbenos y lo resolvemos juntos.</p>
       ${cta(`${env.PUBLIC_SITE_URL}/app/calendar`, 'Ver mi próxima clase')}`,
      { preheader: 'Tu profe te esperó — nos vemos en la próxima' },
    ),

  payroll_paid: (v: { fullName?: string; period: string; classes: number; rateCop: number; amountCop: number }) =>
    wrap(
      `Tu pago de ${v.period} fue aprobado 🎉`,
      `<p>${v.fullName ? `Hola ${v.fullName}, tu` : 'Tu'} pago de nómina del período <b>${v.period}</b> fue aprobado. Este es el detalle:</p>
       <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
         <tr><td style="padding:8px 0;border-bottom:1px solid #eee">Clases dictadas</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right"><b>${v.classes}</b></td></tr>
         <tr><td style="padding:8px 0;border-bottom:1px solid #eee">Tarifa por clase</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">$ ${Number(v.rateCop).toLocaleString('es-CO')} COP</td></tr>
         <tr><td style="padding:8px 0">Total</td><td style="padding:8px 0;text-align:right;font-size:16px"><b>$ ${Number(v.amountCop).toLocaleString('es-CO')} COP</b></td></tr>
       </table>
       <p>Gracias por tu dedicación con cada estudiante. 💛</p>
       ${cta(`${env.PUBLIC_SITE_URL}/teacher`, 'Ir a mi portal')}`,
      { preheader: `Pago aprobado: ${v.classes} clases · $ ${Number(v.amountCop).toLocaleString('es-CO')} COP` },
    ),

  signup_nudge: (v: { fullName?: string }) =>
    wrap(
      'Tu inglés te está esperando 💛',
      `<p>${v.fullName ? `Hola ${v.fullName}, tu` : 'Tu'} cuenta en FreaknEnglish ya está lista — solo falta elegir tu plan para empezar a hablar inglés con tu profe 1 a 1.</p>
       <p>Los horarios con inicio inmediato vuelan: elige tu plan hoy y arranca esta misma semana.</p>
       ${cta(`${env.PUBLIC_SITE_URL}/checkout`, 'Elegir mi plan')}
       <p style="font-size:13px;color:#888;margin-top:16px">¿Dudas sobre qué plan te conviene? Responde este correo y te asesoramos.</p>`,
      { preheader: 'Elige tu plan y arranca esta semana' },
    ),

  nps_monthly: () =>
    wrap('¿Cómo vamos?', `<p>Cuéntanos del 0 al 10.</p>${cta(`${env.PUBLIC_SITE_URL}/app/settings`, 'Dejar mi opinión')}`),

  renewal_3d: () =>
    wrap('Tu plan se renueva en 3 días', `<p>Puedes gestionarlo desde tu portal.</p>${cta(`${env.PUBLIC_SITE_URL}/app/settings`, 'Gestionar plan')}`),

  // ─── Password / cuentas ─────────────────────────────────────────────
  // `expiryLabel` llega del backend con el plazo real ("7 días" para quien aún
  // no tiene contraseña, "1 hora" para un restablecimiento). Se muestra en vez
  // de un "vence pronto" que no decía nada y hacía que la gente lo dejara para
  // después sin saber cuánto margen tenía.
  password_reset: (v: { link: string; expiryLabel?: string }) =>
    wrap(
      'Restablece tu contraseña',
      `<p>Recibimos una solicitud para restablecer tu contraseña.${
        v.expiryLabel ? ` El enlace vence en <b>${v.expiryLabel}</b>.` : ' El enlace vence pronto por seguridad.'
      }</p>
       <p>Si no fuiste tú, ignora este correo.</p>
       ${cta(v.link, 'Crear nueva contraseña')}`,
      { preheader: 'Enlace para restablecer tu contraseña' },
    ),

  account_invite: (v: { fullName: string; link: string; role?: 'student' | 'teacher' | 'admin'; planName?: string; planEndsAt?: string }) => {
    const firstName = v.fullName.split(' ')[0] || v.fullName
    const isTeacher = v.role === 'teacher'
    const isAdmin = v.role === 'admin'
    const planBlock = v.planName
      ? `<div style="background:${env.BRAND_COLOR};border-radius:16px;padding:14px 18px;margin:18px 0">
           <p style="margin:0;font-size:14px"><b>Tu plan ya está activo</b> ✅</p>
           <p style="margin:4px 0 0;font-size:14px;color:#444">${v.planName}${v.planEndsAt ? ` · vigente hasta el <b>${new Date(v.planEndsAt).toLocaleDateString('es-CO', { dateStyle: 'long' })}</b>` : ''}. No tienes que pagar nada por ahora.</p>
         </div>`
      : ''
    const intro = isAdmin
      ? `<p>Hola ${firstName}, te damos acceso de administrador en ${env.BRAND_NAME}. 🔑</p>
         <p>Desde el panel gestionas estudiantes y profesores, planes y pagos, la nómina, el contenido de las clases y la configuración del sitio. Cuida bien tu contraseña: esta cuenta ve y edita todo.</p>`
      : isTeacher
      ? `<p>Hola ${firstName}, ¡bienvenido al equipo de ${env.BRAND_NAME}! 🎉</p>
         <p>Te invitamos a tu portal de profesor: ahí gestionas tu disponibilidad, ves tu calendario de clases 1 a 1 y llevas el progreso de tus estudiantes.</p>`
      : `<p>Hola ${firstName}, ¡qué alegría tenerte en ${env.BRAND_NAME}! 🎉</p>
         <p>Tu cuenta ya está creada. Desde hoy no memorizas inglés: <b>lo hablas</b>, en clases 1 a 1 en vivo con tu propio profesor.</p>`
    const after = isTeacher
      ? `<p style="margin:4px 0">🗓️ &nbsp;Configura tu disponibilidad semanal</p>
         <p style="margin:4px 0">🧑‍🏫 &nbsp;Recibe tus estudiantes asignados</p>
         <p style="margin:4px 0">✍️ &nbsp;Usa el aula colaborativa en vivo</p>`
      : `<p style="margin:4px 0">📅 &nbsp;Elige y consulta tus horarios de clase</p>
         <p style="margin:4px 0">📚 &nbsp;Avanza con módulos y prácticas a tu ritmo</p>
         <p style="margin:4px 0">🧑‍🏫 &nbsp;Habla en vivo con tu profesor desde la primera clase</p>`
    return wrap(
      `Te damos la bienvenida a ${env.BRAND_NAME}, ${firstName} 💛`,
      `${intro}
       ${planBlock}
       <p>Solo falta un paso: crea tu contraseña para entrar a tu portal.</p>
       ${after}
       ${cta(v.link, 'Crear mi contraseña y entrar')}
       <p style="font-size:13px;color:#888;margin-top:16px">Este enlace es personal y vence en 7 días. Si no esperabas esta invitación, puedes ignorar este correo.</p>`,
      { preheader: v.planName ? 'Tu cuenta está lista y tu plan ya está activo' : 'Tu cuenta está lista — crea tu contraseña para entrar' },
    )
  },

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
  // ─── Remarketing / ciclo de renovación ──────────────────────────────
  renewal_reminder: (v: { fullName?: string; endDate: string; planName?: string }) =>
    wrap(
      'Tu plan vence en 5 días',
      `<p>${v.fullName ? `Hola ${v.fullName}, tu` : 'Tu'} plan${v.planName ? ` <b>${v.planName}</b>` : ''} está activo hasta el <b>${v.endDate}</b>.</p>
       <p>Renueva hoy y tu nuevo mes <b>empieza justo cuando termine el actual</b> — no pierdes ni un día, y conservas tu horario y tu profesor de siempre.</p>
       ${cta(`${env.PUBLIC_SITE_URL}/checkout`, 'Renovar mi plan')}
       <p style="font-size:13px;color:#888;margin-top:16px">Si dejas pasar la fecha, guardamos tu cupo solo por 5 días hábiles.</p>`,
      { preheader: 'Renueva sin perder tu horario ni tu profesor' },
    ),

  subscription_expired: (v: { fullName?: string }) =>
    wrap(
      'Tus clases quedaron en pausa ⏸️',
      `<p>${v.fullName ? `Hola ${v.fullName}, tu` : 'Tu'} suscripción venció y tu acceso a las clases quedó en pausa.</p>
       <p>La buena noticia: <b>tu horario y tu profesor siguen reservados para ti durante 5 días hábiles</b>. Reactiva tu plan y retomas exactamente donde ibas — mismo profe, misma hora, mismo progreso.</p>
       ${cta(`${env.PUBLIC_SITE_URL}/checkout`, 'Reactivar mi plan')}
       <p style="font-size:13px;color:#888;margin-top:16px">Pasado ese tiempo tu franja se libera para otros estudiantes. No dejes que se la lleven. 💛</p>`,
      { preheader: 'Tu horario sigue reservado por 5 días hábiles' },
    ),

  slot_released: (v: { fullName?: string }) =>
    wrap(
      'Liberamos tu horario… pero tu progreso sigue aquí',
      `<p>${v.fullName ? `Hola ${v.fullName}, pasaron` : 'Pasaron'} los 5 días hábiles y tu franja quedó disponible para otros estudiantes.</p>
       <p>Lo importante: <b>tu progreso, tu nivel y tu historial siguen intactos</b>. Elige un nuevo horario y vuelve a hablar inglés esta misma semana — te toma 2 minutos.</p>
       ${cta(`${env.PUBLIC_SITE_URL}/checkout`, 'Elegir mi nuevo horario')}
       <p style="font-size:13px;color:#888;margin-top:16px">¿Volviste a tener disponibilidad en tu horario de antes? Puede que aún esté libre — revísalo ahora.</p>`,
      { preheader: 'Tu progreso te espera — elige un nuevo horario' },
    ),
} as const

export type TemplateKey = keyof typeof templates
