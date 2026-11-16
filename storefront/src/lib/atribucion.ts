/**
 * Con qué enlace llegó quien visita: `?promo=` y los `utm_*`.
 *
 * Se guarda en localStorage porque quien llega con el enlace de una campaña
 * rara vez compra en esa misma página: navega al checkout, se va y vuelve. El
 * último enlace gana ("last touch") y caduca a los 30 días.
 */

const CLAVE = "freakn.atribucion";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PARAMS = ["promo", "utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;

export type Atribucion = Partial<Record<(typeof PARAMS)[number], string>>;

type Guardada = { at: number; datos: Atribucion };

/** Lee la atribución de la URL actual y, si trae algo, reemplaza la guardada. */
export function capturarAtribucion(): void {
  if (typeof window === "undefined") return;
  try {
    const sp = new URLSearchParams(window.location.search);
    const datos: Atribucion = {};
    for (const k of PARAMS) {
      const v = sp.get(k)?.trim();
      if (v) datos[k] = v.slice(0, 100);
    }
    if (Object.keys(datos).length === 0) return;
    const guardada: Guardada = { at: Date.now(), datos };
    window.localStorage.setItem(CLAVE, JSON.stringify(guardada));
  } catch {
    // Modo privado o almacenamiento bloqueado: sin atribución, nada se rompe.
  }
}

/** La atribución vigente, o null si no hay o ya caducó. */
export function leerAtribucion(): Atribucion | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CLAVE);
    if (!raw) return null;
    const g = JSON.parse(raw) as Guardada;
    if (!g || typeof g.at !== "number" || Date.now() - g.at > TTL_MS) {
      window.localStorage.removeItem(CLAVE);
      return null;
    }
    return Object.keys(g.datos ?? {}).length > 0 ? g.datos : null;
  } catch {
    return null;
  }
}
