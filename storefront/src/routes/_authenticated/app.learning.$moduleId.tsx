import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Circle, Download, FileText, Lock, PlayCircle, Presentation, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Cargando, EstadoError, PageHeader, Vacio, btnChip, btnPrimaryAuto, cardPlain, cardPrimary, eyebrow, focusRing, tagNeutral, tag } from "@/components/app/AppUi";
import { cn } from "@/lib/utils";
import { learningApi } from "@/lib/api/endpoints";
import { urlDeMedios } from "@/lib/learning/lessonHtml";
import { progresoDelModulo } from "@/lib/learning/progreso";
import { LessonFrame } from "@/components/learning/LessonFrame";

export const Route = createFileRoute("/_authenticated/app/learning/$moduleId")({
  head: ({ params }) => ({ meta: [{ title: `Módulo ${params.moduleId} — FreaknEnglish` }] }),
  component: ModuleDetail,
});

const KIND_ICON: Record<string, typeof PlayCircle> = {
  video: PlayCircle,
  pdf: FileText,
  slides: Presentation,
  download: Download,
  // Neutral a propósito: un icono de "archivo de código" delataba que la
  // lección es un HTML, que es cómo la guardamos, no lo que el alumno ve.
  html: Presentation,
};
const mediaUrl = urlDeMedios;

function ModuleDetail() {
  const { moduleId } = Route.useParams();
  const qc = useQueryClient();
  const modQ = useQuery({ queryKey: ["learning", "module", moduleId], queryFn: () => learningApi.module(moduleId) });
  const progQ = useQuery({ queryKey: ["learning", "progress"], queryFn: () => learningApi.progress() });
  const mod = modQ.data as any;
  const [activeId, setActiveId] = useState<string>("");

  const toggleM = useMutation({
    mutationFn: (v: { lessonId: string; completed: boolean }) => learningApi.saveLessonProgress(v.lessonId, 0, v.completed),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["learning", "progress"] });
      qc.invalidateQueries({ queryKey: ["learning", "modules"] });
    },
  });

  if (modQ.isLoading) return <Cargando>Cargando módulo…</Cargando>;
  if (modQ.isError) {
    return (
      <div className="flex flex-col gap-4">
        <VolverAprender />
        <EstadoError onRetry={() => void modQ.refetch()}>No pudimos cargar este módulo. Revisa tu conexión e inténtalo de nuevo.</EstadoError>
      </div>
    );
  }
  if (!mod) {
    return (
      <div className="flex flex-col gap-4">
        <VolverAprender />
        <Vacio titulo="Módulo no encontrado">Puede que ya no esté disponible. Vuelve a Aprender y elige otro.</Vacio>
      </div>
    );
  }

  const lessons: any[] = [...(mod.lessons ?? [])].sort((a, b) => a.position - b.position);
  const doneIds = new Set(progQ.data?.completedLessonIds ?? []);
  // Arranca en la primera lección accesible (no en una bloqueada).
  const currentActiveId = activeId || (lessons.find((l) => !l.locked) ?? lessons[0])?.id || "";
  const active = lessons.find((l) => l.id === currentActiveId);
  const { done, total, pct } = progresoDelModulo(lessons, doneIds);
  const activeDone = active ? doneIds.has(active.id) : false;

  return (
    <div className="flex flex-col gap-6">
      <div className="px-2 sm:px-0">
        <VolverAprender />
      </div>

      <div className="px-2 sm:px-0">
        <PageHeader
          eyebrowText={`${done} de ${total} actividades · ${pct}%`}
          title={mod.title}
          highlight={mod.title.split(" ").sort((a: string, b: string) => b.length - a.length)[0]}
          aside={
            <div className="min-w-44 max-w-xs" role="group" aria-label="Progreso del módulo">
              <div
                role="progressbar"
                aria-label="Progreso del módulo"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                className="h-2.5 border-[1.5px] border-brand-ink bg-white"
              >
                <div className="h-full bg-brand-ink" style={{ width: `${pct}%` }} />
              </div>
            </div>
          }
        >
          {mod.summary}
        </PageHeader>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <article className={cn(cardPrimary, "flex min-w-0 flex-col gap-4 p-4 [--hard-x:4px] max-sm:border-x-0 max-sm:[box-shadow:none] sm:p-5")}>
          {active ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-[20px] font-extrabold uppercase leading-tight tracking-[-0.01em] text-brand-ink">{active.title}</h2>
                {/* Solo la duración: el `kind` (html, pdf, slides…) es cómo
                    guardamos la lección, no algo que le sirva a quien la ve. */}
                {active.durationMin ? (
                  <span className={cn(tagNeutral, "shrink-0")}>{active.durationMin} min</span>
                ) : null}
              </div>
              {active.locked ? (
                <LockedLesson />
              ) : (
                <LessonViewer lesson={active} />
              )}
              <div className={`flex flex-wrap items-center justify-between gap-3 ${active.locked ? "hidden" : ""}`}>
                <button
                  type="button"
                  onClick={() => toggleM.mutate({ lessonId: active.id, completed: !activeDone })}
                  disabled={toggleM.isPending}
                  aria-pressed={activeDone}
                  className={activeDone ? cn(btnChip, "min-h-12 px-5") : btnPrimaryAuto}
                >
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  {activeDone ? "Lección completada" : "Marcar como completada"}
                </button>
                {(active.kind === "download" || active.kind === "pdf") && mediaUrl(active) ? (
                  <a href={mediaUrl(active)} target="_blank" rel="noreferrer" className={cn("inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-brand-ink underline underline-offset-2 hover:text-brand-ink-soft", focusRing)}>
                    <Download className="size-4" aria-hidden="true" /> Descargar recurso
                  </a>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-brand-ink/80">Este módulo no tiene lecciones aún.</p>
          )}
        </article>

        <aside aria-labelledby="lecciones" className={cn(cardPlain, "mx-2 self-start p-2 sm:mx-0")}>
          <h2 id="lecciones" className={cn(eyebrow, "px-3 py-2.5")}>Lecciones</h2>
          <ul className="flex flex-col gap-0.5">
            {lessons.map((l: any) => {
              const Icon = KIND_ICON[l.kind] ?? FileText;
              const isDone = doneIds.has(l.id);
              const isActive = l.id === currentActiveId;
              const locked = !!l.locked;
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => !locked && setActiveId(l.id)}
                    disabled={locked}
                    aria-current={isActive ? "true" : undefined}
                    title={locked ? "Tu profe habilita el contenido a medida que avanzas" : undefined}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                      locked
                        ? "cursor-not-allowed text-brand-ink/70"
                        : isActive
                          ? "bg-brand-ink font-bold text-brand-cream dark:text-white"
                          : "font-medium text-brand-ink hover:bg-brand-cream",
                      focusRing,
                    )}
                  >
                    {locked ? (
                      <Lock className="size-4 shrink-0" aria-hidden="true" />
                    ) : isDone ? (
                      <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <Circle className="size-4 shrink-0 opacity-60" aria-hidden="true" />
                    )}
                    <Icon className="size-4 shrink-0 opacity-70" aria-hidden="true" />
                    <span className="flex-1">{l.title}</span>
                    {isDone ? <span className="sr-only">(completada)</span> : null}
                    {locked ? <span className="sr-only">(bloqueada)</span> : null}
                    {l.isCheckpoint ? <span className={cn(tag, "px-2 py-0 text-[10px]")}>Checkpoint</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}


/**
 * Pantalla que ve el estudiante cuando la lección está bloqueada.
 *
 * El mensaje es genérico a propósito: el motivo interno (checkpoint pendiente
 * vs. lección aún no habilitada) es detalle nuestro y no le dice nada útil al
 * estudiante — la acción es la misma en los dos casos, hablar con su profe.
 */
function LockedLesson() {
  return (
    <div className="border-2 border-dashed border-brand-ink/50 bg-brand-cream p-8 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full border-2 border-dashed border-brand-ink/60 bg-white">
        <Lock className="size-6 text-brand-ink/70" aria-hidden="true" />
      </div>
      <h3 className="mt-4 font-display text-lg font-extrabold uppercase text-brand-ink">Contenido bloqueado</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-brand-ink/80">
        Tu profe habilita el contenido a medida que avanzas, para que vayas con las bases firmes.
        Coméntale en tu próxima clase que quieres seguir.
      </p>
      <Link to="/app/learning" className={cn(btnPrimaryAuto, "mt-5")}>
        Volver al catálogo
      </Link>
    </div>
  );
}

function LessonViewer({ lesson }: { lesson: any }) {
  const url = mediaUrl(lesson);
  const qc = useQueryClient();

  // El estudiante SIEMPRE empieza la lección por el principio, así que abrirla
  // es una corrida nueva: la primera entrega reemplaza lo anterior y suma un
  // intento. Las siguientes son de esa misma corrida (varias lecciones reportan
  // tras cada respuesta) y no deben volver a contar como intento.
  const corridaNueva = useRef(true);
  useEffect(() => {
    corridaNueva.current = true;
  }, [lesson.id]);

  // Bridge FreaknActivity: las lecciones HTML estandarizadas reportan sus
  // resultados por postMessage; aquí se guardan en la plataforma.
  useEffect(() => {
    if (lesson.kind !== "html") return;
    const onMessage = async (e: MessageEvent) => {
      const data = e.data;
      if (!data || data.source !== "freakn-lesson") return;
      if (data.type === "freakn:activity:result" && data.payload?.activityId) {
        try {
          const esNueva = corridaNueva.current;
          corridaNueva.current = false;
          await learningApi.saveActivityResult(lesson.id, { ...data.payload, nuevaCorrida: esNueva });
          qc.invalidateQueries({ queryKey: ["learning", "activity-results"] });
          const p = data.payload;
          toast.success(
            typeof p.score === "number" && typeof p.maxScore === "number"
              ? `Resultado guardado: ${p.score}/${p.maxScore}`
              : "¡Actividad completada y guardada!",
          );
        } catch {
          toast.error("No pudimos guardar tu resultado. Revisa tu conexión.");
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [lesson.id, lesson.kind, qc]);

  // Resultados previos del estudiante en esta lección.
  const resultsQ = useQuery({
    queryKey: ["learning", "activity-results", lesson.id],
    queryFn: () => learningApi.myActivityResults(lesson.id),
    enabled: lesson.kind === "html",
  });

  if (lesson.kind === "html") {
    return (
      <div className="flex flex-col gap-3">
        <LessonFrame title={lesson.title} html={lesson.contentHtml ?? url ?? ""} lessonId={lesson.id} />
        {(resultsQ.data ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {resultsQ.data!.map((r) => (
              <span key={r.id} className={cn(tag, "gap-1.5 px-3 py-1.5 text-xs")}>
                <Trophy className="size-3.5" aria-hidden="true" />
                {r.title ?? r.activityId}
                {r.score != null && r.maxScore != null ? `: ${r.score}/${r.maxScore}` : ""}
                {r.attempts > 1 ? ` · ${r.attempts} intentos` : ""}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  if (lesson.kind === "video" || lesson.kind === "slides") {
    return (
      <div className="aspect-video w-full overflow-hidden border-2 border-brand-ink bg-brand-ink/5">
        <iframe src={url} title={lesson.title} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      </div>
    );
  }
  if (lesson.kind === "pdf") {
    return (
      <div className="border-2 border-brand-ink bg-brand-cream p-8 text-center">
        <FileText className="mx-auto size-10 text-brand-ink" aria-hidden="true" />
        <p className="mt-3 text-sm text-brand-ink/80">Documento PDF listo para leer o descargar.</p>
        {url ? <a href={url} target="_blank" rel="noreferrer" className={cn(btnPrimaryAuto, "mt-4")}>Abrir PDF</a> : null}
      </div>
    );
  }
  return (
    <div className="border-2 border-brand-ink bg-brand-cream p-8 text-center">
      <Download className="mx-auto size-10 text-brand-ink" aria-hidden="true" />
      <p className="mt-3 text-sm text-brand-ink/80">Recurso descargable. Úsalo offline para practicar entre clases.</p>
    </div>
  );
}

function VolverAprender() {
  return (
    <Link to="/app/learning" className={cn("inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-brand-ink underline-offset-2 hover:underline", focusRing)}>
      <ArrowLeft className="size-4" aria-hidden="true" /> Volver a aprender
    </Link>
  );
}
