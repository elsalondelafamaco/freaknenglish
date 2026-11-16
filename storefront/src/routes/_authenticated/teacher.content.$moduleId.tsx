import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Check, CheckCircle2, Circle, Download, FileText, Flag, PlayCircle, Presentation,
} from "lucide-react";
import { toast } from "sonner";
import { learningApi, teachersApi } from "@/lib/api/endpoints";
import { urlDeMedios } from "@/lib/learning/lessonHtml";
import { LessonFrame } from "@/components/learning/LessonFrame";
import { BarraAlumnoEnClase, useAlumnoEnClase } from "@/components/learning/AlumnoEnClase";
import { cn } from "@/lib/utils";
import { Cargando, EstadoError, Titulo, eyebrow, focusRing, tagNeutral } from "@/components/app/AppUi";
import { btnRow, btnRowInk } from "@/components/teacher/TeacherUi";

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
    const m = new Map<string, { unlocked: boolean; completedAt: string | null; progreso: number }>();
    for (const mod of planQ.data ?? []) {
      for (const l of mod.lessons) {
        m.set(l.lessonId, {
          unlocked: l.unlocked,
          completedAt: (l.completedAt as any) ?? null,
          progreso: l.progreso ?? 0,
        });
      }
    }
    return m;
  }, [planQ.data]);

  const mod = modQ.data as any;
  // `alumnoListo` evita montar la lección antes de saber con qué alumno se está:
  // si llegara después, el iframe se recargaría y perdería el slide.
  if (modQ.isLoading || !alumnoListo) return <Cargando>Cargando módulo…</Cargando>;
  if (!mod) return <EstadoError onRetry={() => void modQ.refetch()}>Módulo no encontrado.</EstadoError>;

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
        className={cn("inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-bold text-brand-ink underline underline-offset-2", focusRing)}
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Volver al contenido
      </Link>

      <BarraAlumnoEnClase alumnoId={studentId ?? ""} onElegir={elegir} />

      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <Titulo className="text-[28px] md:text-[36px]">{mod.title}</Titulo>
          {mod.summary ? <p className="mt-3 max-w-xl text-[15px] text-brand-ink/80">{mod.summary}</p> : null}
        </div>
        {studentId ? (
          <div className="shadow-hard border-2 border-brand-ink bg-white px-4 py-3 text-sm">
            <div className={eyebrow}>{alumno?.fullName ?? "Estudiante"}</div>
            <div className="font-display text-[26px] font-extrabold leading-none text-brand-ink">{abiertas}/{lessons.length}</div>
            <div className="text-xs text-brand-ink/70">lecciones habilitadas</div>
            <button
              type="button"
              onClick={() => unlock.mutate({ lessonIds: ids, unlock: abiertas < lessons.length })}
              disabled={unlock.isPending}
              className={cn("mt-2 w-full", abiertas < lessons.length ? btnRowInk : btnRow)}
            >
              {abiertas < lessons.length ? "Habilitar módulo" : "Bloquear módulo"}
            </button>
          </div>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <article className="flex min-w-0 flex-col gap-4 border-2 border-brand-ink bg-white p-5">
          {active ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-[20px] font-extrabold uppercase leading-tight text-brand-ink">{active.title}</h2>
                {/* Igual que en el visor del estudiante: sin `kind`, que es
                    detalle de cómo guardamos la lección. */}
                {active.durationMin ? (
                  <span className={tagNeutral}>{active.durationMin} min</span>
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
                    className={cn("min-h-11 px-5 text-[13px]", estado.get(active.id)?.unlocked ? btnRow : btnRowInk)}
                  >
                    {estado.get(active.id)?.unlocked
                      ? "Habilitada para el estudiante — bloquear"
                      : "Habilitar para el estudiante"}
                  </button>
                  <Link
                    to="/teacher/students/$studentId"
                    params={{ studentId }}
                    className={cn("inline-flex min-h-11 items-center text-sm font-bold text-brand-ink underline underline-offset-2", focusRing)}
                  >
                    Ver respuestas y avance →
                  </Link>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-brand-ink/80">Este módulo no tiene lecciones aún.</p>
          )}
        </article>

        <aside aria-label="Lecciones del módulo" className="self-start border-2 border-brand-ink bg-white p-3">
          <div className={cn(eyebrow, "px-2 py-2")}>Lecciones</div>
          <ul className="flex flex-col">
            {lessons.map((l) => {
              const Icon = KIND_ICON[l.kind] ?? FileText;
              const st = estado.get(l.id);
              const isActive = l.id === (activeId || lessons[0]?.id);
              return (
                <li key={l.id} className="relative">
                  {/* Barra de avance al pie, estilo miniatura de video: dice
                      hasta dónde llegaron con ESTE alumno, para no tener que
                      acordarse de en qué módulo iban. */}
                  {studentId && (st?.progreso ?? 0) > 0 ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-3 bottom-0.5 h-1 overflow-hidden bg-brand-ink/15"
                    >
                      <span
                        className={`block h-full ${st?.completedAt ? "bg-brand-success" : "bg-brand-ink"}`}
                        style={{ width: `${Math.round((st?.progreso ?? 0) * 100)}%` }}
                      />
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setActiveId(l.id)}
                    title={
                      studentId && (st?.progreso ?? 0) > 0
                        ? `Trabajada al ${Math.round((st?.progreso ?? 0) * 100)}%`
                        : undefined
                    }
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                      focusRing,
                      isActive
                        ? "bg-brand-ink text-brand-cream dark:text-white"
                        : "text-brand-ink hover:bg-brand-cream-soft",
                    )}
                  >
                    {isActive ? (
                      <Check className="size-4 shrink-0" aria-hidden="true" />
                    ) : st?.completedAt ? (
                      <CheckCircle2 className="size-4 shrink-0 text-brand-success" aria-label="Completada" />
                    ) : (
                      <Circle className="size-4 shrink-0 opacity-50" aria-hidden="true" />
                    )}
                    <Icon className="size-4 shrink-0 opacity-70" aria-hidden="true" />
                    <span className="flex-1 font-semibold">{l.title}</span>
                    {l.isCheckpoint ? (
                      <>
                        <Flag className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="sr-only">Punto de control</span>
                      </>
                    ) : null}
                    {studentId ? (
                      <span
                        className={cn(
                          "rounded-full border-[1.5px] px-2 py-0.5 text-[10px] font-bold",
                          st?.unlocked
                            ? "border-brand-ink bg-brand-yellow-soft text-brand-ink"
                            : "border-dashed border-current opacity-80",
                        )}
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
        recordarSlide={!!studentId}
      />
    );
  }
  if (lesson.kind === "video" && url) {
    return (
      <div className="aspect-video w-full overflow-hidden border-2 border-brand-ink bg-black">
        <iframe title={lesson.title} src={url} allowFullScreen className="h-full w-full" />
      </div>
    );
  }
  if (url) {
    return (
      <div className="border-2 border-dashed border-brand-ink/40 bg-white/60 p-6 text-center">
        <p className="text-sm text-brand-ink/80">{lesson.summary ?? "Recurso externo."}</p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={cn(btnRowInk, "mt-3 min-h-11 px-5 text-[13px]")}
        >
          <Download className="size-4" /> Abrir recurso
        </a>
      </div>
    );
  }
  return (
    <p className="border-2 border-dashed border-brand-ink/40 bg-white/60 p-6 text-sm text-brand-ink/80">
      Esta lección no tiene contenido cargado todavía.
    </p>
  );
}
