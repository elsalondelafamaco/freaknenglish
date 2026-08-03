import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Circle, Download, FileText, FileCode, Lock, PlayCircle, Presentation, Trophy } from "lucide-react";
import { toast } from "sonner";
import { learningApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/app/learning/$moduleId")({
  head: ({ params }) => ({ meta: [{ title: `Módulo ${params.moduleId} — FreaknEnglish` }] }),
  component: ModuleDetail,
});

const KIND_ICON: Record<string, typeof PlayCircle> = {
  video: PlayCircle,
  pdf: FileText,
  slides: Presentation,
  download: Download,
  html: FileCode,
};
const mediaUrl = (l: any) => l.videoUrl || l.slidesUrl || l.pdfUrl || l.url || "";

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

  if (modQ.isLoading) return <p className="text-sm text-brand-ink/60">Cargando módulo…</p>;
  if (!mod) return <p className="text-sm text-brand-ink/60">Módulo no encontrado.</p>;

  const lessons: any[] = [...(mod.lessons ?? [])].sort((a, b) => a.position - b.position);
  const doneIds = new Set(progQ.data?.completedLessonIds ?? []);
  // Arranca en la primera lección accesible (no en una bloqueada).
  const currentActiveId = activeId || (lessons.find((l) => !l.locked) ?? lessons[0])?.id || "";
  const active = lessons.find((l) => l.id === currentActiveId);
  const total = lessons.length;
  const done = lessons.filter((l) => doneIds.has(l.id)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const activeDone = active ? doneIds.has(active.id) : false;

  return (
    <div className="flex flex-col gap-6">
      <Link to="/app/learning" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink/65 hover:text-brand-ink">
        <ArrowLeft className="size-4" /> Volver a aprendizaje
      </Link>

      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-4xl">{mod.coverEmoji ?? "📘"}</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">{mod.title}</h1>
          <p className="mt-1 max-w-xl text-[15px] text-brand-ink/65">{mod.summary}</p>
        </div>
        <div className="rounded-2xl border border-brand-line bg-white px-4 py-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-brand-ink/55">Progreso</div>
          <div className="text-xl font-bold text-brand-ink">{pct}%</div>
          <div className="text-xs text-brand-ink/55">{done}/{total} lecciones</div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <article className="flex flex-col gap-4 rounded-3xl border border-brand-line bg-white p-5">
          {active ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold text-brand-ink">{active.title}</h2>
                <span className="rounded-full bg-brand-cream px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-brand-ink/65">
                  {active.kind} · {active.durationMin ?? 0} min
                </span>
              </div>
              {active.locked ? (
                <LockedLesson />
              ) : (
                <LessonViewer lesson={active} />
              )}
              <div className={`flex flex-wrap items-center justify-between gap-3 ${active.locked ? "hidden" : ""}`}>
                <button
                  onClick={() => toggleM.mutate({ lessonId: active.id, completed: !activeDone })}
                  disabled={toggleM.isPending}
                  className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-60 ${activeDone ? "bg-brand-success/15 text-brand-success" : "bg-brand-ink text-white hover:bg-brand-ink-soft"}`}
                >
                  <CheckCircle2 className="size-4" />
                  {activeDone ? "Lección completada" : "Marcar como completada"}
                </button>
                {(active.kind === "download" || active.kind === "pdf") && mediaUrl(active) ? (
                  <a href={mediaUrl(active)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink/70 hover:text-brand-ink">
                    <Download className="size-4" /> Descargar recurso
                  </a>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-brand-ink/55">Este módulo no tiene lecciones aún.</p>
          )}
        </article>

        <aside className="rounded-3xl border border-brand-line bg-white p-3">
          <div className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-brand-ink/55">Lecciones</div>
          <ul className="flex flex-col">
            {lessons.map((l: any) => {
              const Icon = KIND_ICON[l.kind] ?? FileText;
              const isDone = doneIds.has(l.id);
              const isActive = l.id === currentActiveId;
              const locked = !!l.locked;
              return (
                <li key={l.id}>
                  <button
                    onClick={() => !locked && setActiveId(l.id)}
                    disabled={locked}
                    title={locked ? "Tu profe habilita el contenido a medida que avanzas" : undefined}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition ${
                      locked
                        ? "cursor-not-allowed text-brand-ink/35"
                        : isActive
                          ? "bg-brand-cream text-brand-ink"
                          : "text-brand-ink/75 hover:bg-brand-cream/50"
                    }`}
                  >
                    {locked ? (
                      <Lock className="size-4 text-brand-ink/30" />
                    ) : isDone ? (
                      <CheckCircle2 className="size-4 text-brand-success" />
                    ) : (
                      <Circle className="size-4 text-brand-ink/35" />
                    )}
                    <Icon className={`size-4 ${locked ? "text-brand-ink/25" : "text-brand-ink/60"}`} />
                    <span className="flex-1 font-medium">{l.title}</span>
                    {l.isCheckpoint ? <span className="text-[10px]">🏁</span> : null}
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
 * Prepara el HTML de la lección antes de montarlo en el iframe.
 *
 * Las 111 lecciones traen `<script src="https://cdn.tailwindcss.com">`. Ese CDN
 * a veces no carga (bloqueado por red corporativa, DNS, o simplemente lento):
 * la lección tarda muchísimo y, cuando el script no llega, los slides se rompen
 * porque pierden TODO su CSS. Se reemplaza por una copia servida desde nuestro
 * propio dominio: mismo script, sin depender de terceros y con carga inmediata.
 *
 * Se hace aquí, al renderizar, y NO editando los HTML: así funciona igual para
 * el contenido que ya existe y para cualquier lección futura que use el CDN.
 * El iframe usa `srcDoc`, cuyo documento no tiene URL base, por eso la ruta
 * debe ser absoluta.
 */
function prepararHtmlLeccion(html: string): string {
  if (!html) return html;
  const origen = typeof window !== "undefined" ? window.location.origin : "";
  return html.replaceAll("https://cdn.tailwindcss.com", `${origen}/vendor/tailwind-cdn.js`);
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
    <div className="rounded-2xl border border-brand-line bg-brand-cream/40 p-8 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-white shadow-soft">
        <Lock className="size-6 text-brand-ink/60" />
      </div>
      <h3 className="mt-4 text-lg font-bold text-brand-ink">Contenido bloqueado</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-brand-ink/70">
        Tu profe habilita el contenido a medida que avanzas, para que vayas con las bases firmes.
        Coméntale en tu próxima clase que quieres seguir.
      </p>
      <Link
        to="/app/learning"
        className="mt-5 inline-block rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white hover:bg-brand-ink-soft"
      >
        Volver al catálogo
      </Link>
    </div>
  );
}

function LessonViewer({ lesson }: { lesson: any }) {
  const url = mediaUrl(lesson);
  const qc = useQueryClient();

  // Bridge FreaknActivity: las lecciones HTML estandarizadas reportan sus
  // resultados por postMessage; aquí se guardan en la plataforma.
  useEffect(() => {
    if (lesson.kind !== "html") return;
    const onMessage = async (e: MessageEvent) => {
      const data = e.data;
      if (!data || data.source !== "freakn-lesson") return;
      if (data.type === "freakn:activity:result" && data.payload?.activityId) {
        try {
          await learningApi.saveActivityResult(lesson.id, data.payload);
          qc.invalidateQueries({ queryKey: ["learning", "activity-results"] });
          const p = data.payload;
          toast.success(
            typeof p.score === "number" && typeof p.maxScore === "number"
              ? `Resultado guardado: ${p.score}/${p.maxScore} 🎉`
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
        <div className="h-[72vh] w-full overflow-hidden rounded-2xl border border-brand-line bg-white">
          <iframe title={lesson.title} srcDoc={prepararHtmlLeccion(lesson.contentHtml ?? url ?? "")} className="h-full w-full bg-white" sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin" />
        </div>
        {(resultsQ.data ?? []).length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {resultsQ.data!.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1.5 rounded-full bg-brand-yellow/50 px-3 py-1.5 text-xs font-semibold text-brand-ink">
                <Trophy className="size-3.5" />
                {r.title ?? r.activityId}
                {r.score != null && r.maxScore != null ? `: ${r.score}/${r.maxScore}` : " ✓"}
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
      <div className="aspect-video w-full overflow-hidden rounded-2xl border border-brand-line bg-brand-ink/5">
        <iframe src={url} title={lesson.title} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      </div>
    );
  }
  if (lesson.kind === "pdf") {
    return (
      <div className="rounded-2xl border border-brand-line bg-brand-cream/40 p-8 text-center">
        <FileText className="mx-auto size-10 text-brand-ink/60" />
        <p className="mt-3 text-sm text-brand-ink/70">Documento PDF listo para leer o descargar.</p>
        {url ? <a href={url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white hover:bg-brand-ink-soft">Abrir PDF</a> : null}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-brand-line bg-brand-cream/40 p-8 text-center">
      <Download className="mx-auto size-10 text-brand-ink/60" />
      <p className="mt-3 text-sm text-brand-ink/70">Recurso descargable. Úsalo offline para practicar entre clases.</p>
    </div>
  );
}
