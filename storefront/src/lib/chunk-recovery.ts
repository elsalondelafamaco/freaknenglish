/**
 * Recuperación de la app cuando el navegador pide un trozo de código que ya no
 * existe.
 *
 * La app se parte en archivos con hash (`/assets/x-HASH.js`) y cada despliegue
 * los renombra. Una pestaña abierta de antes sigue nombrando los viejos, así que
 * al navegar a una sección que todavía no había cargado, la importación falla y
 * salta la pantalla de "Algo se rompió". No es un error de la aplicación: es una
 * versión vieja pidiendo piezas de una que ya no está, y se arregla recargando.
 *
 * Por eso aquí se recarga UNA vez. El guardado en `sessionStorage` existe para
 * que, si tras recargar vuelve a fallar —que entonces sí sería un problema de
 * verdad—, se muestre el error en vez de dejar la pestaña recargándose sola.
 */
const CLAVE = "freakn.ultimaRecargaPorChunk";
/** Dos recargas seguidas dentro de este plazo son un bucle, no una recuperación. */
const MARGEN_MS = 20_000;

export function pareceTrozoFaltante(error: unknown): boolean {
  const mensaje = typeof error === "string" ? error : ((error as Error)?.message ?? "");
  return (
    /Failed to fetch dynamically imported module/i.test(mensaje) ||
    /error loading dynamically imported module/i.test(mensaje) ||
    /Importing a module script failed/i.test(mensaje) ||
    /ChunkLoadError/i.test(mensaje) ||
    // Safari/Firefox cuando el servidor responde HTML donde esperaban JavaScript.
    /expected a JavaScript(-| )module script/i.test(mensaje)
  );
}

/** Recarga si no venimos de recargar hace nada. Devuelve si recargó. */
export function recargarPorTrozoFaltante(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ultima = Number(window.sessionStorage.getItem(CLAVE) ?? 0);
    if (Date.now() - ultima < MARGEN_MS) return false;
    window.sessionStorage.setItem(CLAVE, String(Date.now()));
  } catch {
    // Sin sessionStorage (modo privado, cookies bloqueadas) no hay guarda posible:
    // se prefiere no recargar antes que arriesgar un bucle.
    return false;
  }
  window.location.reload();
  return true;
}

/** Recarga solo si el error es de los nuestros; si no, lo deja pasar. */
export function recuperarSiEsTrozoFaltante(error: unknown): boolean {
  return pareceTrozoFaltante(error) ? recargarPorTrozoFaltante() : false;
}

export function vigilarTrozosFaltantes() {
  if (typeof window === "undefined") return;

  // Vite avisa de los fallos de precarga antes de que exploten en la ruta.
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    recargarPorTrozoFaltante();
  });

  // Y la red de seguridad para las importaciones que no pasan por la precarga.
  window.addEventListener("unhandledrejection", (e) => {
    if (recuperarSiEsTrozoFaltante(e.reason)) e.preventDefault();
  });
}
