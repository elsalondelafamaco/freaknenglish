import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Maximize2, Minimize2 } from "lucide-react";
import { prepararHtmlLeccion } from "@/lib/learning/lessonHtml";
import { learningApi } from "@/lib/api/endpoints";

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
 *
 * Con `recordarSlide` la lección retoma donde quedó la clase anterior. Una
 * lección interactiva puede tomar dos o tres clases y antes cada una volvía a
 * empezar en el slide 1. El avance se guarda contra el ESTUDIANTE (`studentId`
 * cuando es el profe quien tiene la pantalla abierta), nunca contra quien
 * comparte pantalla — si no, todos los alumnos de un profe compartirían slide.
 */
export function LessonFrame({
  title,
  html,
  lessonId,
  studentId,
  recordarSlide = false,
}: {
  title: string;
  html: string;
  lessonId?: string;
  /** Alumno dueño del avance. Sin esto se guarda contra quien está en sesión. */
  studentId?: string;
  recordarSlide?: boolean;
}) {
  const [expandido, setExpandido] = useState(false);
  const recuerda = recordarSlide && !!lessonId;

  // El slide guardado hay que tenerlo ANTES de montar el iframe: `srcDoc` sólo
  // se lee al crear el documento, así que si llegara después no serviría.
  // `gcTime: 0` — la posición cambia con cada "Next", así que la respuesta no
  // se guarda en caché: al cerrar la lección se descarta. Con caché, volver a
  // abrirla en la misma sesión reutilizaba el valor de la primera vez y la
  // lección arrancaba donde estaba entonces, no donde se quedó. Y hace falta
  // que el segundo montaje vuelva a quedar "pendiente", para no pintar el
  // iframe con el dato viejo mientras se refresca.
  const slideQ = useQuery({
    queryKey: ["learning", "last-slide", lessonId, studentId],
    queryFn: () => learningApi.lastSlide(lessonId!, studentId),
    enabled: recuerda,
    staleTime: 0,
    gcTime: 0,
  });

  useEffect(() => {
    if (!recuerda) return;
    const alMensaje = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.source !== "freakn-lesson") return;
      // Silencioso: pasa en cada "Next Step" y un aviso por slide sería
      // insoportable. Si falla, la clase sigue; se reintenta al siguiente.
      // La posición llega como la maneje la lección: un número o el id de un
      // slide. Se guarda tal cual y se le devuelve igual.
      const pos = d.payload?.slide;
      if (d.type === "freakn:slide" && (typeof pos === "number" || typeof pos === "string")) {
        learningApi.saveLastSlide(lessonId!, pos, studentId).catch(() => undefined);
      }
    };
    window.addEventListener("message", alMensaje);
    return () => window.removeEventListener("message", alMensaje);
  }, [recuerda, lessonId, studentId]);

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

  if (recuerda && slideQ.isPending) {
    return (
      <div className="flex h-[72vh] w-full items-center justify-center rounded-2xl border border-brand-line bg-white">
        <div className="size-8 animate-spin rounded-full border-2 border-brand-ink/20 border-t-brand-ink" />
      </div>
    );
  }

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
        srcDoc={prepararHtmlLeccion(html, slideQ.data?.slide ?? null)}
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
