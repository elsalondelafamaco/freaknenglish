/**
 * D9 · PWA — limpieza del service worker.
 *
 * Ya no se registra ninguno (ver `registerPwa` abajo): lo único que hace este
 * módulo es desregistrar los que hayan quedado y borrar sus cachés.
 */
async function unregisterAppSw() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      // Se desregistra cualquiera de este origen, no solo el de /sw.js: a quien
      // le quedó uno de una versión anterior puede tener otro nombre.
      await r.unregister();
    }
  } catch { /* ignore */ }
}

/** Borra las cachés del service worker: son las que guardan HTML y assets viejos. */
async function borrarCachesDelSw() {
  if (!("caches" in window)) return;
  try {
    const nombres = await caches.keys();
    await Promise.all(
      nombres.filter((n) => /^(html-nav|workbox|freakn)/i.test(n)).map((n) => caches.delete(n)),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Hoy NO se registra ningún service worker: se desregistra el que haya.
 *
 * El `sw.js` que genera el build queda en `dist/` y el servidor sirve otra
 * carpeta, así que `/sw.js` responde 404 y el registro fallaba en cada carga.
 * Peor: a quien le alcanzó a quedar registrado de un despliegue anterior, su
 * service worker le servía el HTML cacheado hasta 24 h —el HTML que nombra los
 * trozos de código de una versión que ya no está—. Esa es la otra mitad del
 * "Algo se rompió" que no se iba. Mientras no se publique de verdad, lo sano es
 * quitarlo; la app no depende de él para nada (no hay modo sin conexión).
 */
export async function registerPwa() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  await unregisterAppSw();
  await borrarCachesDelSw();
}