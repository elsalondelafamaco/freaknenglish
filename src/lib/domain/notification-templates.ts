/**
 * Plantillas de email/in-app de Freakn'.
 *
 * Cada template recibe `vars` tipadas y devuelve `{ subject, html }`.
 * El HTML es **inline-styled** para máxima compatibilidad con clientes
 * de email (Gmail, Outlook). Mantenemos paleta de marca (cream + ink +
 * yellow) coherente con la landing.
 *
 * Cuando migremos a Resend real, este archivo se queda igual: lo único
 * que cambia es el transport que recibe `html`.
 */

export type TemplateKey =
  | "welcome"
  | "abandoned-cart"
  | "class-reminder"
  | "renewal-reminder"
  | "nps-monthly";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TemplateVars = Record<string, any>;

export interface RenderedTemplate {
  subject: string;
  html: string;
}

const BRAND = {
  cream: "#FEF6C7",
  yellow: "#FBE34B",
  ink: "#0A0A0A",
  inkSoft: "#3C3C3C",
  line: "#E8E2C8",
};

function shell(title: string, inner: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${BRAND.cream};font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:${BRAND.ink};">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;">Freakn<span style="color:${BRAND.yellow}">'</span></div>
    <div style="background:#fff;border:1px solid ${BRAND.line};border-radius:20px;padding:28px;margin-top:16px;">
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;">${title}</h1>
      ${inner}
    </div>
    <div style="font-size:11px;color:${BRAND.inkSoft};margin-top:18px;text-align:center;">
      Freakn' English · 1-on-1 real conversations · ¿Dudas? hola@freakn.com
    </div>
  </div>
</body></html>`;
}

function btn(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${BRAND.ink};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px;margin-top:14px;">${label}</a>`;
}

export function renderTemplate(key: TemplateKey, vars: TemplateVars): RenderedTemplate {
  switch (key) {
    case "welcome":
      return {
        subject: `¡Bienvenido a Freakn', ${vars.fullName?.split(" ")[0] ?? "crack"}!`,
        html: shell(
          `¡Vamos a hablar inglés de verdad!`,
          `<p style="margin:0 0 10px;font-size:15px;line-height:1.55;">Tu plan <strong>${vars.planLabel}</strong> está activo. En las próximas 24h te asignamos profesor y vas a recibir tu primera clase agendada.</p>
           <p style="margin:0 0 8px;font-size:15px;line-height:1.55;">Mientras tanto, entra al portal y revisa tu nivel inicial.</p>
           ${btn("/app", "Entrar a mi portal")}`,
        ),
      };

    case "abandoned-cart":
      return {
        subject: `${vars.fullName?.split(" ")[0] ?? "Hey"}, te quedó pendiente tu plan en Freakn'`,
        html: shell(
          `Tu plan ${vars.planLabel} te está esperando`,
          `<p style="margin:0 0 10px;font-size:15px;line-height:1.55;">Vimos que empezaste a registrarte pero no completaste el pago. Si tienes alguna duda, responde este email — somos humanos del otro lado.</p>
           ${btn(vars.resumeUrl, "Retomar mi suscripción")}`,
        ),
      };

    case "class-reminder": {
      const when = new Date(vars.startsAt as string);
      const human = `${when.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })} · ${when.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`;
      return {
        subject: `Tu clase de inglés es ${vars.whenLabel}`,
        html: shell(
          `Recordatorio: clase ${vars.whenLabel}`,
          `<p style="margin:0 0 10px;font-size:15px;line-height:1.55;">Hola ${vars.fullName?.split(" ")[0] ?? ""}, tu clase 1-on-1 es <strong>${human}</strong>.</p>
           <p style="margin:0 0 8px;font-size:15px;line-height:1.55;">Conéctate 2 minutos antes desde el botón.</p>
           ${btn(vars.meetingUrl, "Entrar a la clase")}`,
        ),
      };
    }

    case "renewal-reminder":
      return {
        subject: `Tu plan Freakn' se renueva pronto`,
        html: shell(
          `Renovación próxima`,
          `<p style="margin:0 0 10px;font-size:15px;line-height:1.55;">Tu plan <strong>${vars.planLabel}</strong> se renueva el <strong>${new Date(vars.renewsAt as string).toLocaleDateString("es-CO")}</strong>. No tienes que hacer nada — el cobro es automático con Wompi.</p>
           ${btn("/app/settings", "Gestionar mi suscripción")}`,
        ),
      };

    case "nps-monthly":
      return {
        subject: `¿Cómo vamos este mes? (1 minuto)`,
        html: shell(
          `Tu opinión vale oro`,
          `<p style="margin:0 0 10px;font-size:15px;line-height:1.55;">Hola ${vars.fullName?.split(" ")[0] ?? ""}, en una escala de 0 a 10, ¿qué tan probable es que recomiendes Freakn' a alguien que esté aprendiendo inglés?</p>
           ${btn("/app", "Responder ahora")}`,
        ),
      };
  }
}