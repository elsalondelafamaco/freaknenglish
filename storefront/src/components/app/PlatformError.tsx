import { MessageCircle, RefreshCw, WifiOff } from "lucide-react";

export const SUPPORT_WHATSAPP = "573012646770";

export function supportWhatsAppUrl(message: string) {
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;
}

/**
 * Banner para cuando el backend se cae con una sesión ya activa: avisa sin
 * botar al usuario de lo que estaba haciendo.
 */
export function BackendDownBanner() {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
      <p className="text-sm font-medium text-amber-900">
        Estamos teniendo problemas de conexión con la plataforma. Algunos datos
        pueden no cargar.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white"
        >
          <RefreshCw className="size-3.5" /> Recargar
        </button>
        <a
          href={supportWhatsAppUrl(
            "Hola, la plataforma de Freakn English me muestra problemas de conexión. ¿Me pueden ayudar?",
          )}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900"
        >
          <MessageCircle className="size-3.5" /> Soporte
        </a>
      </div>
    </div>
  );
}

/**
 * Pantalla de error de plataforma: se muestra cuando el backend no responde
 * (caído, sin red, 5xx) dentro del portal autenticado. La home pública NO usa
 * esto — allí cada sección tiene su propio fallback de venta.
 */
export function PlatformError({ onRetry }: { onRetry?: () => void }) {
  const retry = onRetry ?? (() => window.location.reload());
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-cream px-5">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-soft">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-yellow-soft">
          <WifiOff className="size-7 text-brand-ink" />
        </div>
        <h1 className="mt-5 text-xl font-bold text-brand-ink">
          Tuvimos un problema de conexión
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-brand-ink/65">
          No pudimos comunicarnos con la plataforma. Suele resolverse en unos
          segundos — intenta recargar. Si el problema continúa, escríbenos y te
          ayudamos de inmediato.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            onClick={retry}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-brand-ink text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-brand-ink-soft"
          >
            <RefreshCw className="size-4" /> Recargar la página
          </button>
          <a
            href={supportWhatsAppUrl(
              "Hola, soy estudiante de Freakn English y la plataforma me muestra un error de conexión. ¿Me pueden ayudar?",
            )}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-brand-line bg-white text-sm font-semibold text-brand-ink transition hover:bg-brand-cream/40"
          >
            <MessageCircle className="size-4" /> Hablar con soporte
          </a>
        </div>
      </div>
    </div>
  );
}
