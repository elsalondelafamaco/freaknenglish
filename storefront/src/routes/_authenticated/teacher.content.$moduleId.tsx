import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, CheckCircle2, Circle, Download, FileText, PlayCircle, Presentation,
} from "lucide-react";
import { toast } from "sonner";
import { learningApi, teachersApi } from "@/lib/api/endpoints";
import { urlDeMedios } from "@/lib/learning/lessonHtml";
import { LessonFrame } from "@/components/learning/LessonFrame";
import { BarraAlumnoEnClase, useAlumnoEnClase } from "@/components/learning/AlumnoEnClase";

export const Route = createFileRoute("/_authenticated/teacher/content/$moduleId")({
  head: ({ params }) => ({ meta: [{ title: `Contenido ${params.moduleId} — Profesor` }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    studentId: typeof s.studentId === "string" && s.studentId ? s.studentId : undefined,
    // Nivel desde el que se entró, para poder volver a esa misma pestaña.
    level:
      s.level === "beginner" || s.level === "intermediate" || s.level === "advanced"
        ? s.level
        : undefined,
  }),
  component: TeacherModuleViewer,
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

/**
 * Visor de contenido del profesor.
 *
 * Ve TODO sin compuertas — el backend no aplica gating a profes ni admin — y
 * eso es a propósito: necesita revisar los slides para preparar la clase,
 * incluso los de lecciones que aún no le abrió a nadie.
 *
 * Con `?studentId=` en la URL se superpone el estado de ESE estudiante
 * (habilitada / bloqueada / completada) y se puede abrir o cerrar cada lección
 * sin salir del visor, que es donde el profe realmente decide qué habilitar.
 */
function TeacherModuleViewer() {
  const { moduleId } = Route.useParams();
  // El alumno puede venir en la URL (entrando por "Ver contenido" del perfil)
  // o de la elección que el profe ya hizo en Contenido. Las dos puertas llevan
  // al mismo sitio; antes sólo servía la primera.
  const { studentId: studentIdUrl, level: levelUrl } = Route.useSearch();
  const { alumnoId: studentId, elegir: recordarAlumno, listo: alumnoListo } = useAlumnoEnClase(studentIdUrl);
  const navigate = useNavigate();
  // Cambiar de alumno tiene que tocar TAMBIÉN la URL. La URL manda sobre lo
  // recordado, así que sin esto el selector de la barra no hacía nada visible
  // cuando se había llegado con `?studentId=`.
  const elegir = (id: string) => {
    recordarAlumno(id);
    navigate({
      to: "/teacher/content/$moduleId",
      params: { moduleId },
      search: ({ ...(id ? { studentId: id } : {}), ...(levelUrl ? { level: levelUrl } : {}) }) as never,
      replace: true,
    });
  };
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState("");

  const modQ = useQuery({
    queryKey: ["learning", "module", moduleId],
    queryFn: () => learningApi.module(moduleId),
  });
  const planQ = useQuery({
    queryKey: ["lesson-plan", studentId],
    queryFn: () => teachersApi.lessonPlan(studentId!),
    enabled: !!studentId,
  });
  const alumnoQ = useQuery({
    queryKey: ["teacher", "students"],
    queryFn: () => teachersApi.students(),
    enabled: !!studentId,
  });

  const unlock = useMutation({
    mutationFn: (v: { lessonIds: string[]; unlock: boolean }) =>
      teachersApi.setLessonUnlocks(studentId!, v.lessonIds, v.unlock),
    onSuccess: (r, v) => {
      toast.success(
        v.unlock ? `${r.afectadas} lección(es) habilitada(s)` : `${r.afectadas} lección(es) bloqueada(s)`,
      );
      qc.invalidateQueries({ queryKey: ["lesson-plan", studentId] });
      qc.invalidateQueries({ queryKey: ["checkpoint-gates", studentId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo actualizar"),
  });

  /** lessonId → estado de ese estudiante. Vacío si no se eligió estudiante. */
  const estado = useMemo(() => {
    const m = new Map<string, { unlocked: boolean; completedAt: string | null }>();
    for (const mod of planQ.data ?? []) {
      for (const l of mod.lessons) {
        m.set(l.lessonId, { unlocked: l.unlocked, completedAt: (l.completedAt as any) ?? null });
      }
    }
    return m;
  }, [planQ.data]);

  const mod = modQ.data as any;
  // `alumnoListo` evita montar la lección antes de saber con qué alumno se está:
  // si llegara después, el iframe se recargaría y perdería el slide.
  if (modQ.isLoading || !alumnoListo) return <p className="text-sm text-brand-ink/60">Cargando módulo…</p>;
  if (!mod) return <p className="text-sm text-brand-ink/60">Módulo no encontrado.</p>;

  const lessons: any[] = [...(mod.lessons ?? [])].sort((a, b) => a.position - b.position);
  const active = lessons.find((l) => l.id === (activeId || lessons[0]?.id));
  const alumno = (alumnoQ.data ?? []).find((s: any) => s.id === studentId);
  const ids = lessons.map((l) => l.id);
  const abiertas = ids.filter((id) => estado.get(id)?.unlocked).length;

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/teacher/content"
        // El nivel sale de la URL, y si se llegó sin él (por ejemplo desde la
        // ficha del alumno) se deduce del propio módulo: volver al básico
        // estando en intermedio era justo lo que molestaba.
        search={
          {
            ...(studentId ? { studentId } : {}),
            ...(levelUrl || mod?.level ? { level: levelUrl ?? mod.level } : {}),
          } as any
        }
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink/65 hover:text-brand-ink"
      >
        <ArrowLeft className="size-4" /> Volver al contenido
      </Link>

      <BarraAlumnoEnClase alumnoId={studentId ?? ""} onElegir={elegir} />

      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-4xl">{mod.coverEmoji ?? "📘"}</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">{mod.title}</h1>
          <p className="mt-1 max-w-xl text-[15px] text-brand-ink/65">{mod.summary}</p>
        </div>
        {studentId ? (
          <div className="rounded-2xl border border-brand-line bg-white px-4 py-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-brand-ink/55">
              {alumno?.fullName ?? "Estudiante"}
            </div>
            <div className="text-xl font-bold text-brand-ink">{abiertas}/{lessons.length}</div>
            <div className="text-xs text-brand-ink/55">lecciones habilitadas</div>
            <button
              type="button"
              onClick={() => unlock.mutate({ lessonIds: ids, unlock: abiertas < lessons.length })}
              disabled={unlock.isPending}
              className={`mt-2 w-full rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                abiertas < lessons.length
                  ? "bg-brand-ink text-white hover:bg-brand-ink-soft"
                  : "border border-brand-line text-brand-ink/70 hover:bg-brand-cream/40"
              }`}
            >
              {abiertas < lessons.length ? "Habilitar módulo" : "Bloquear módulo"}
            </button>
          </div>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <article className="flex flex-col gap-4 rounded-3xl border border-brand-line bg-white p-5">
          {active ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold text-brand-ink">{active.title}</h2>
                {/* Igual que en el visor del estudiante: sin `kind`, que es
                    detalle de cómo guardamos la lección. */}
                {active.durationMin ? (
                  <span className="rounded-full bg-brand-cream px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-brand-ink/65">
                    {active.durationMin} min
                  </span>
                ) : null}
              </div>
              <ContenidoLeccion lesson={active} studentId={studentId} />
              {studentId ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      unlock.mutate({ lessonIds: [active.id], unlock: !estado.get(active.id)?.unlocked })
                    }
                    disabled={unlock.isPending}
                    className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition disabled:opacity-60 ${
                      estado.get(active.id)?.unlocked
                        ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        : "bg-brand-ink text-white hover:bg-brand-ink-soft"
                    }`}
                  >
                    {estado.get(active.id)?.unlocked
                      ? "Habilitada para el estudiante — bloquear"
                      : "Habilitar para el estudiante"}
                  </button>
                  <Link
                    to="/teacher/students/$studentId"
                    params={{ studentId }}
                    className="text-sm font-medium text-brand-ink/70 hover:text-brand-ink"
                  >
                    Ver respuestas y avance →
                  </Link>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-brand-ink/55">Este módulo no tiene lecciones aún.</p>
          )}
        </article>

        <aside className="rounded-3xl border border-brand-line bg-white p-3">
          <div className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-brand-ink/55">
            Lecciones
          </div>
          <ul className="flex flex-col">
            {lessons.map((l) => {
              const Icon = KIND_ICON[l.kind] ?? FileText;
              const st = estado.get(l.id);
              const isActive = l.id === (activeId || lessons[0]?.id);
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(l.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition ${
                      isActive ? "bg-brand-cream text-brand-ink" : "text-brand-ink/75 hover:bg-brand-cream/50"
                    }`}
                  >
                    {st?.completedAt ? (
                      <CheckCircle2 className="size-4 text-brand-success" />
                    ) : (
                      <Circle className="size-4 text-brand-ink/35" />
                    )}
                    <Icon className="size-4 text-brand-ink/60" />
                    <span className="flex-1 font-medium">{l.title}</span>
                    {l.isCheckpoint ? <span className="text-[10px]">🏁</span> : null}
                    {studentId ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          st?.unlocked
                            ? "bg-emerald-100 text-emerald-800"
                            : "border border-brand-line text-brand-ink/50"
                        }`}
                      >
                        {st?.unlocked ? "Abierta" : "Cerrada"}
                      </span>
                    ) : null}
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
 * Contenido crudo de la lección. A diferencia del visor del estudiante, aquí
 * NO se guarda progreso ni resultados: el profe está revisando el material, no
 * cursándolo, y sus interacciones no deben contarle a nadie.
 *
 * La excepción es el slide: con `?studentId=` el profe no está revisando, está
 * DANDO la clase de ese alumno —normalmente compartiendo pantalla— y ahí sí
 * hay que recordar dónde quedaron. Se guarda contra el alumno, nunca contra el
 * profe. En la biblioteca de contenido (sin alumno) no se guarda nada.
 */
function ContenidoLeccion({ lesson, studentId }: { lesson: any; studentId?: string }) {
  const url = urlDeMedios(lesson);

  if (lesson.kind === "html") {
    return (
      <LessonFrame
        title={lesson.title}
        html={lesson.contentHtml ?? url ?? ""}
        lessonId={lesson.id}
        studentId={studentId}
      />
    );
  }
  if (lesson.kind === "video" && url) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
        <iframe title={lesson.title} src={url} allowFullScreen className="h-full w-full" />
      </div>
    );
  }
  if (url) {
    return (
      <div className="rounded-2xl border border-brand-line bg-brand-cream/30 p-6 text-center">
        <p className="text-sm text-brand-ink/70">{lesson.summary ?? "Recurso externo."}</p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white hover:bg-brand-ink-soft"
        >
          <Download className="size-4" /> Abrir recurso
        </a>
      </div>
    );
  }
  return (
    <p className="rounded-2xl border border-brand-line bg-brand-cream/30 p-6 text-sm text-brand-ink/60">
      Esta lección no tiene contenido cargado todavía.
    </p>
  );
}
