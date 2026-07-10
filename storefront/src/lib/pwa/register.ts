/**
 * D9 · PWA — registro guardado del service worker.
 *
 * Cumple con la política del skill/pwa:
 * - Sólo se registra en producción real.
 * - Nunca en dev, iframe, preview de Lovable, ni con `?sw=off`.
 * - En cualquier contexto rechazado desregistramos SWs existentes de /sw.js
 *   para no dejar cachés "colgadas" en el editor/preview.
 */
const SW_URL = "/sw.js";

function isPreviewHost(host: string) {
  return (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  );
}

async function unregisterAppSw() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      const scriptUrl =
        (r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "");
      if (scriptUrl.endsWith(SW_URL)) await r.unregister();
    }
  } catch { /* ignore */ }
}

export async function registerPwa() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const inIframe = window.self !== window.top;
  const host = window.location.hostname;
  const hasKillSwitch = new URL(window.location.href).searchParams.get("sw") === "off";
  const isProd = import.meta.env.PROD;

  if (!isProd || inIframe || isPreviewHost(host) || hasKillSwitch) {
    await unregisterAppSw();
    return;
  }

  try {
    await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  } catch (e) {
    console.warn("[pwa] SW registration failed", e);
  }
}