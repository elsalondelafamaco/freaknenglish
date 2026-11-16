/**
 * Lo que el navegador hace directo con Wompi en el cobro dentro del sitio.
 *
 * El número de la tarjeta se manda a Wompi con la llave PÚBLICA y vuelve un
 * token: nunca pasa por nuestro servidor. Todo lo demás (crear el cobro, saber
 * si se aprobó) va por nuestro backend.
 */

/** Medios que el sitio sabe cobrar (los mismos nombres que usa Wompi). */
export type MedioDePago = "CARD" | "NEQUI" | "PSE" | "BANCOLOMBIA_TRANSFER" | "DAVIPLATA";

export const NOMBRE_DEL_MEDIO: Record<MedioDePago, string> = {
  CARD: "Tarjeta",
  NEQUI: "Nequi",
  PSE: "PSE",
  BANCOLOMBIA_TRANSFER: "Bancolombia",
  DAVIPLATA: "Daviplata",
};

export const soloDigitos = (s: string) => s.replace(/\D/g, "");

/** Algoritmo de Luhn: descarta un número mal escrito antes de ir a Wompi. */
export function luhnValido(numero: string): boolean {
  const d = soloDigitos(numero);
  if (d.length < 13 || d.length > 19) return false;
  let suma = 0;
  let doble = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (doble) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    suma += n;
    doble = !doble;
  }
  return suma % 10 === 0;
}

/** "MM/AA" vigente. Devuelve el mes y el año como los pide Wompi, o null. */
export function vencimientoValido(texto: string, hoy = new Date()): { mes: string; anio: string } | null {
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const mes = Number(m[1]);
  const anio = 2000 + Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  // Vence el último día de ese mes.
  if (new Date(anio, mes, 1) <= new Date(hoy.getFullYear(), hoy.getMonth(), 1)) return null;
  return { mes: m[1], anio: m[2] };
}

/** "4242 4242 4242 4242" mientras se escribe. */
export const formatoTarjeta = (s: string) => soloDigitos(s).slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");

/** "12/29" mientras se escribe. */
export function formatoVencimiento(s: string): string {
  const d = soloDigitos(s).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

/** Celular colombiano de 10 dígitos (3xx), con o sin el +57. */
export function celularColombiano(s?: string | null): string | null {
  let d = soloDigitos(s ?? "");
  if (d.length === 12 && d.startsWith("57")) d = d.slice(2);
  return /^3\d{9}$/.test(d) ? d : null;
}

export class ErrorDeTarjeta extends Error {}

/** Token de la tarjeta, pedido directo a Wompi con la llave pública. */
export async function tokenizarTarjeta(
  apiUrl: string,
  llavePublica: string,
  t: { numero: string; cvc: string; mes: string; anio: string; titular: string },
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${apiUrl}/tokens/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${llavePublica}` },
      body: JSON.stringify({
        number: soloDigitos(t.numero),
        cvc: t.cvc,
        exp_month: t.mes,
        exp_year: t.anio,
        card_holder: t.titular.trim().toUpperCase(),
      }),
    });
  } catch {
    throw new ErrorDeTarjeta("No pudimos conectarnos para validar la tarjeta. Revisa tu conexión e intenta de nuevo.");
  }
  const json = await res.json().catch(() => ({}));
  const token = json?.data?.id;
  if (res.ok && typeof token === "string") return token;
  const campos: Record<string, string[]> = json?.error?.messages ?? {};
  if (campos.number) throw new ErrorDeTarjeta("Revisa el número de la tarjeta.");
  if (campos.cvc) throw new ErrorDeTarjeta("Revisa el código de seguridad (CVC).");
  if (campos.exp_month || campos.exp_year) throw new ErrorDeTarjeta("Revisa la fecha de vencimiento.");
  if (campos.card_holder) throw new ErrorDeTarjeta("Escribe el nombre como aparece en la tarjeta.");
  throw new ErrorDeTarjeta("No pudimos validar la tarjeta. Revisa los datos e intenta de nuevo.");
}

/** Los seis datos del navegador que pide el 3D Secure de la tarjeta. */
export function datosDelNavegador() {
  return {
    browser_color_depth: String(screen.colorDepth || 24),
    browser_screen_height: String(screen.height || 0),
    browser_screen_width: String(screen.width || 0),
    browser_language: String(navigator.language || "es-CO"),
    browser_user_agent: String(navigator.userAgent || ""),
    browser_tz: String(new Date().getTimezoneOffset()),
  };
}

declare global {
  interface Window {
    $wompi?: { initialize: (cb: (d: { sessionId?: string; deviceData?: { deviceID?: string } }) => void) => void };
  }
}

let huella: Promise<{ sessionId?: string; deviceId?: string }> | null = null;

/**
 * Huella antifraude oficial de Wompi. Opcional: si el script no carga en 5 s
 * (bloqueadores, red lenta), el pago sigue sin ella. Nunca frena un cobro.
 */
export function huellaAntifraude(llavePublica: string): Promise<{ sessionId?: string; deviceId?: string }> {
  if (huella) return huella;
  huella = new Promise((resolve) => {
    const listo = (v?: { sessionId?: string; deviceId?: string }) => {
      clearTimeout(tope);
      resolve(v ?? {});
    };
    const tope = setTimeout(() => resolve({}), 5000);
    try {
      const s = document.createElement("script");
      s.src = "https://wompijs.wompi.com/libs/js/v1.js";
      s.async = true;
      s.setAttribute("data-public-key", llavePublica);
      s.onload = () => {
        try {
          window.$wompi?.initialize((d) => listo({ sessionId: d?.sessionId, deviceId: d?.deviceData?.deviceID }));
        } catch {
          listo();
        }
      };
      s.onerror = () => listo();
      document.head.appendChild(s);
    } catch {
      listo();
    }
  });
  return huella;
}

/**
 * Navegador metido dentro de una app (Instagram, Facebook, TikTok). Ahí pagar
 * suele fallar de formas raras: la app cierra la vista al ir a Nequi o al banco,
 * borra lo guardado en la pestaña, o no abre la app del banco. Se detecta para
 * ofrecer abrir el pago en el navegador del teléfono.
 */
export function navegadorEmbebido(ua: string): "Instagram" | "Facebook" | "TikTok" | null {
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A|\bFBSV\b|Messenger/i.test(ua)) return "Facebook";
  if (/musical_ly|TikTok|BytedanceWebview|trill_/i.test(ua)) return "TikTok";
  return null;
}

export const esAndroid = (ua: string) => /Android/i.test(ua);

/**
 * Enlace para abrir esta misma página en Chrome desde Android. Instagram y
 * Facebook no dejan abrir el navegador del sistema con un enlace normal; este
 * formato sí, y si Chrome no está, cae en la misma URL.
 */
export function enlaceAChrome(url: string): string {
  const u = new URL(url);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}

/**
 * Explicación de un rechazo según lo que respondió el banco. Wompi manda un
 * texto libre en `status_message`; se reconocen los casos comunes.
 */
export function describirRechazo(estado: string, mensaje?: string | null): string {
  const m = (mensaje ?? "").toLowerCase();
  if (/fondos|insufficient/.test(m)) return "El pago fue rechazado por fondos insuficientes.";
  if (/vencid|expired/.test(m)) return "El pago fue rechazado: la tarjeta está vencida.";
  if (/cvc|cvv|seguridad/.test(m)) return "El pago fue rechazado: el código de seguridad no coincide.";
  if (/3ds|autentica/.test(m)) return "El banco no pudo autenticar la tarjeta. Prueba con otro medio de pago.";
  if (/cancel/.test(m)) return "El pago fue cancelado.";
  if (estado === "VOIDED") return "El pago fue anulado. No se hizo ningún cobro.";
  if (estado === "ERROR") return "Hubo un error procesando el pago y no se hizo ningún cobro. Intenta de nuevo o usa otro medio.";
  return "El pago no pasó y no se hizo ningún cobro. Revisa los datos o prueba con otro medio de pago.";
}
