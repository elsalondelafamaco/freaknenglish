/**
 * El pago en curso, guardado para poder retomarlo.
 *
 * Va en `localStorage` y no en `sessionStorage` a propósito. Quien paga desde
 * Instagram sale a la app de Nequi o del banco; al volver, la app muchas veces
 * vuelve a crear la vista desde cero, y `sessionStorage` (que vive con la
 * pestaña) llega vacío. `localStorage` sobrevive a eso. Las dos integraciones
 * anteriores usaban `sessionStorage` y ahí perdían el pago.
 *
 * Además, la referencia viaja en la URL (`?pago=`): recargar la página la trae
 * de vuelta aunque no haya nada guardado.
 */

const CLAVE = "freakn.pagoEnCurso";
/** Un pago de hace más de un día ya no se retoma: o se resolvió o venció. */
const VIGENCIA_MS = 24 * 60 * 60 * 1000;

export type PagoEnCurso = { reference: string; llave: string; planId: string; ts: number };

export function guardarPago(p: Omit<PagoEnCurso, "ts">) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ ...p, ts: Date.now() }));
  } catch {
    /* sin almacenamiento (modo privado): queda la URL */
  }
}

/** El pago guardado, si es de este plan y sigue vigente. */
export function leerPago(planId: string, reference?: string | null): PagoEnCurso | null {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as PagoEnCurso | null;
    if (!p?.reference || !p.llave || p.planId !== planId) return null;
    if (Date.now() - p.ts > VIGENCIA_MS) return null;
    if (reference && p.reference !== reference) return null;
    return p;
  } catch {
    return null;
  }
}

export function borrarPago() {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* nada que borrar */
  }
}

/**
 * Llave que llegó en la URL (`?k=`), al abrir el pago en otro navegador desde
 * Instagram. Se guarda y se SACA de la URL en el acto: no tiene que quedar en
 * el historial, ni en un enlace copiado después, ni en lo que mide el píxel.
 */
export function tomarLlaveDeLaUrl(planId: string): PagoEnCurso | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const reference = url.searchParams.get("pago");
  const llave = url.searchParams.get("k");
  if (!reference || !llave) return null;
  url.searchParams.delete("k");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  guardarPago({ reference, llave, planId });
  return { reference, llave, planId, ts: Date.now() };
}

/** URL de esta página con el pago, para seguir en otro navegador. Lleva la llave. */
export function enlaceParaOtroNavegador(p: { reference: string; llave: string }): string {
  const url = new URL(window.location.href);
  url.searchParams.set("pago", p.reference);
  url.searchParams.set("k", p.llave);
  return url.toString();
}
