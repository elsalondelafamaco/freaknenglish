/** Inline-styled HTML email templates (Resend-compatible). */
const wrap = (title: string, body: string) => `
<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;background:#FEF6C7;padding:24px;color:#0A0A0A">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:24px;padding:32px">
    <h1 style="font-size:24px;margin:0 0 16px">${title}</h1>
    ${body}
    <p style="margin-top:32px;font-size:12px;color:#666">Freakn English · 1 a 1 en vivo</p>
  </div>
</body></html>`

export const templates = {
  welcome: (v: { fullName: string }) =>
    wrap('¡Bienvenido a Freakn!', `<p>Hola ${v.fullName}, tu cuenta está lista.</p>`),
  reminder_24h: (v: { startsAt: string }) =>
    wrap('Tu clase es mañana', `<p>Te esperamos en Freakn el ${v.startsAt}.</p>`),
  reminder_1h: () => wrap('Tu clase comienza en 1 hora', `<p>¡Prepárate!</p>`),
  abandoned_cart: (v: { planName: string }) =>
    wrap('Tu plan te está esperando', `<p>Completa tu inscripción al plan ${v.planName}.</p>`),
  nps_monthly: () => wrap('¿Cómo vamos?', `<p>Cuéntanos del 0 al 10.</p>`),
  renewal_3d: () => wrap('Tu plan se renueva en 3 días', `<p>Gestiónalo en tu portal.</p>`),
} as const

export type TemplateKey = keyof typeof templates
