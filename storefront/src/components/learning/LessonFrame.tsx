import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Maximize2, Minimize2, RotateCcw } from "lucide-react";
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
 * Con `recordarSlide` la lección retoma donde quedó la clase anterior: una
 * lección interactiva puede tomar dos o tres clases y volver a pasar los slides
 * cada vez es tiempo de clase perdido. El avance se guarda contra el ESTUDIANTE
 * (`studentId`), nunca contra quien comparte pantalla — que casi siempre es el
 * profe, y si no todos sus alumnos compartirían la misma posición.
 *
 * El portal del estudiante NO lo activa: si retomara, la lección le calificaría
 * sólo las preguntas que le faltaban.
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
  /** Alumno dueño del avance y del resultado. Sin esto no se guarda nada. */
  studentId?: string;
  recordarSlide?: boolean;
}) {
  const [expandido, setExpandido] = useState(false);
  // Cambiar esta `key` desmonta y vuelve a montar el iframe, así que el
  // `srcDoc` se ejecuta desde cero. Es la forma de ofrecer "volver a empezar"
  // en TODAS las lecciones: la mayoría no trae botón propio de reintentar, y
  // los HTML no se tocan.
  const [intento, setIntento] = useState(0);
  const [confirmandoReinicio, setConfirmandoReinicio] = useState(false);
  // Tras reiniciar hay que ignorar la posición guardada, o el iframe se
  // remontaría con el mismo marcador inyectado y volvería al slide de antes.
  const [reiniciado, setReiniciado] = useState(false);

  const recuerda = recordarSlide && !!lessonId && !!studentId;

  // El slide guardado hay que tenerlo ANTES de montar el iframe: `srcDoc` sólo
  // se lee al crear el documento, así que si llegara después no serviría.
  // `gcTime: 0` — la posición cambia con cada "Next", así que la respuesta no
  // se guarda en caché: al cerrar la lección se descarta. Con caché, volver a
  // abrirla en la misma sesión reutilizaba el valor de la primera vez y la
  // lección arrancaba donde estaba entonces, no donde se quedó.
  const slideQ = useQuery({
    queryKey: ["learning", "last-slide", lessonId, studentId],
    queryFn: () => learningApi.lastSlide(lessonId!, studentId),
    enabled: recuerda,
    staleTime: 0,
    gcTime: 0,
  });

  const slideInicial = reiniciado ? null : (slideQ.data?.slide ?? null);

  // ¿La próxima entrega es de una corrida nueva? Lo es cuando la lección abre
  // por el principio (o el profe reinició); cuando retoma, no — ahí el servidor
  // tiene que MEZCLAR con lo de la clase anterior en vez de reemplazarlo.
  // Es un ref y no estado: cambia dentro del listener y no debe re-renderizar.
  const corridaNueva = useRef(true);
  useEffect(() => {
    corridaNueva.current = !slideInicial;
  }, [slideInicial, intento]);

  useEffect(() => {
    // Ojo: este efecto no es sólo del alumno en su portal — es el ÚNICO
    // registro de resultados cuando el profe abre la lección con un estudiante
    // seleccionado. Si se condiciona de más, el profe deja de guardar notas.
    if (!lessonId || !studentId) return;
    const alMensaje = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.source !== "freakn-lesson") return;
      // Silencioso: pasa en cada "Next Step" y un aviso por slide sería
      // insoportable. Si falla, la clase sigue; se reintenta al siguiente.
      // La posición llega como la maneje la lección: un número o el id de un
      // slide. Se guarda tal cual y se le devuelve igual.
      const pos = d.payload?.slide;
      if (d.type === "freakn:slide" && (typeof pos === "number" || typeof pos === "string")) {
        if (recuerda) learningApi.saveLastSlide(lessonId, pos, studentId).catch(() => undefined);
        return;
      }
      // Resultados de las actividades. Sólo cuando hay alumno: en clase la
      // lección la tiene abierta el profe compartiendo pantalla, y lo que
      // responde el alumno no quedaba registrado en ninguna parte. Sin alumno
      // (biblioteca) no se guarda, y en el portal del estudiante lo maneja su
      // propia pantalla, que además le avisa en pantalla.
      if (d.type === "freakn:activity:result" && d.payload?.activityId) {
        const esNueva = corridaNueva.current;
        corridaNueva.current = false;
        learningApi
          .saveActivityResult(lessonId, { ...d.payload, studentId, nuevaCorrida: esNueva })
          .catch(() => undefined);
      }
    };
    window.addEventListener("message", alMensaje);
    return () => window.removeEventListener("message", alMensaje);
  }, [lessonId, studentId, recuerda]);

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

  function reiniciar() {
    setReiniciado(true);
    setIntento((n) => n + 1);
    setConfirmandoReinicio(false);
    corridaNueva.current = true;
    // Y se borra en el servidor: si sólo se ignorara en memoria, al cerrar y
    // volver a abrir la lección retomaría otra vez donde estaba.
    if (recuerda && lessonId) {
      learningApi.saveLastSlide(lessonId, null, studentId).catch(() => undefined);
    }
  }

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
        key={intento}
        title={title}
        srcDoc={prepararHtmlLeccion(html, slideInicial)}
        className="h-full w-full bg-white"
        sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
      />
      <div
        className={`absolute right-3 top-3 z-10 flex items-center gap-2 transition ${
          expandido ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100"
        }`}
      >
        {/* Confirmación en dos pasos y no `confirm()`: Chrome lo suprime en
            varias situaciones y el botón se quedaría sin hacer nada. */}
        {confirmandoReinicio ? (
          <span className="flex items-center gap-1 rounded-full bg-brand-ink/80 px-2 py-1 text-xs text-white backdrop-blur">
            ¿Perder lo avanzado?
            <button type="button" onClick={reiniciar} className="rounded-full bg-white/20 px-2 py-0.5 font-semibold hover:bg-white/30">
              Sí
            </button>
            <button type="button" onClick={() => setConfirmandoReinicio(false)} className="px-1 hover:underline">
              No
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmandoReinicio(true)}
            title="Volver a empezar"
            aria-label="Volver a empezar la lección"
            className="rounded-full bg-brand-ink/80 p-2 text-white shadow-soft backdrop-blur transition hover:bg-brand-ink"
          >
            <RotateCcw className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          title={expandido ? "Salir (Esc)" : "Ver en grande"}
          aria-label={expandido ? "Salir de la vista ampliada" : "Ver en grande"}
          className="rounded-full bg-brand-ink/80 p-2 text-white shadow-soft backdrop-blur transition hover:bg-brand-ink"
        >
          {expandido ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
      </div>
    </div>
  );
}
