import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { prepararHtmlLeccion } from "@/lib/learning/lessonHtml";

/**
 * Iframe de una lección HTML con botón de pantalla completa.
 *
 * Intenta primero la Fullscreen API (ocupa el monitor entero, sin barra del
 * navegador). Si el navegador la niega —pasa en iframes con permisos
 * restringidos, en algunos WebView y en iOS— cae a un modo "a pantalla" por
 * CSS: `fixed inset-0`, que igual tapa sidebar y lista de lecciones, que es lo
 * que se busca. Nunca queda un botón que no hace nada.
 *
 * Esc cierra en ambos modos.
 */
export function LessonFrame({ title, html }: { title: string; html: string }) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const [nativo, setNativo] = useState(false);
  const [porCss, setPorCss] = useState(false);
  const expandido = nativo || porCss;

  // Fullscreen nativo: el estado real lo manda el navegador (se puede salir
  // con Esc o desde su propia UI, sin pasar por nuestro botón).
  useEffect(() => {
    const alCambiar = () => setNativo(document.fullscreenElement === contenedorRef.current);
    document.addEventListener("fullscreenchange", alCambiar);
    return () => document.removeEventListener("fullscreenchange", alCambiar);
  }, []);

  // En el modo CSS el navegador no gestiona Esc: lo hacemos nosotros.
  useEffect(() => {
    if (!porCss) return;
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPorCss(false);
    };
    window.addEventListener("keydown", alTecla);
    return () => window.removeEventListener("keydown", alTecla);
  }, [porCss]);

  const alternar = useCallback(async () => {
    const el = contenedorRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    if (porCss) {
      setPorCss(false);
      return;
    }
    try {
      await el.requestFullscreen();
    } catch {
      // El navegador no lo permite: expandimos por CSS, que llega igual de
      // lejos para el caso de uso (tapar sidebar y lecciones).
      setPorCss(true);
    }
  }, [porCss]);

  return (
    <div
      ref={contenedorRef}
      // `relative` y `fixed` no pueden convivir en la lista: Tailwind emite las
      // dos y gana la del CSS, no la del orden de la cadena. Por eso el
      // posicionamiento se elige en un solo sitio.
      className={`group overflow-hidden bg-white ${
        porCss
          ? "fixed inset-0 z-50 h-screen w-screen rounded-none border-0"
          : nativo
            ? "relative h-screen w-full rounded-none border-0"
            : "relative h-[72vh] w-full rounded-2xl border border-brand-line"
      }`}
    >
      <iframe
        title={title}
        srcDoc={prepararHtmlLeccion(html)}
        className="h-full w-full bg-white"
        // `allow-*` sin `allowFullScreen`: el contenido del slide no necesita
        // pedir fullscreen por su cuenta, lo controlamos desde fuera.
        sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
      />
      <button
        type="button"
        onClick={alternar}
        title={expandido ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
        aria-label={expandido ? "Salir de pantalla completa" : "Pantalla completa"}
        // Siempre visible al expandir: ahí es la única salida además de Esc.
        className={`absolute right-3 top-3 z-10 rounded-full bg-brand-ink/80 p-2 text-white shadow-soft backdrop-blur transition hover:bg-brand-ink ${
          expandido ? "opacity-100" : "opacity-0 focus:opacity-100 group-hover:opacity-100"
        }`}
      >
        {expandido ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </button>
    </div>
  );
}
