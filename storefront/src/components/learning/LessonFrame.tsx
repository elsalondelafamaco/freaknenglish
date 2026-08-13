import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { prepararHtmlLeccion } from "@/lib/learning/lessonHtml";

/**
 * Iframe de una lección HTML con modo "a pantalla".
 *
 * Es un modal `fixed inset-0` DENTRO de la página, NO la Fullscreen API del
 * navegador: esa se apodera del monitor, tapa el resto de ventanas y estorba a
 * quien está dando clase con la pantalla compartida o con otra app al lado.
 * El modal ocupa toda la ventana —que es lo que se busca: quitar del medio el
 * sidebar y la lista de lecciones— y deja el sistema operativo en paz.
 *
 * Se cierra con Esc o con el botón.
 */
export function LessonFrame({ title, html }: { title: string; html: string }) {
  const [expandido, setExpandido] = useState(false);

  useEffect(() => {
    if (!expandido) return;
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandido(false);
    };
    window.addEventListener("keydown", alTecla);
    // Bloquea el scroll de la página detrás del modal: sin esto, rodar la
    // rueda sobre el borde movía el contenido de abajo.
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", alTecla);
      document.body.style.overflow = overflowPrevio;
    };
  }, [expandido]);

  return (
    <div
      className={`group overflow-hidden bg-white ${
        expandido
          ? "fixed inset-0 z-50 h-screen w-screen"
          : "relative h-[72vh] w-full rounded-2xl border border-brand-line"
      }`}
    >
      <iframe
        title={title}
        srcDoc={prepararHtmlLeccion(html)}
        className="h-full w-full bg-white"
        sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
      />
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        title={expandido ? "Salir (Esc)" : "Ver en grande"}
        aria-label={expandido ? "Salir de la vista ampliada" : "Ver en grande"}
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
