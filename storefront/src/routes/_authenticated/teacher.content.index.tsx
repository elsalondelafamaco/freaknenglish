import { useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Check } from "lucide-react";
import { learningApi, teachersApi } from "@/lib/api/endpoints";
import { BarraAlumnoEnClase, useAlumnoEnClase } from "@/components/learning/AlumnoEnClase";
import type { EnglishLevel } from "@/lib/domain/types";
import { leccionesInteractivas } from "@/lib/learning/progreso";
import { cn } from "@/lib/utils";
import { Cargando, EstadoError, PageHeader, SeccionTitulo, Vacio, focusRing, tagNeutral } from "@/components/app/AppUi";
import { pillClass } from "@/components/teacher/TeacherUi";

const ES_NIVEL = (v: unknown): v is EnglishLevel =>
  v === "beginner" || v === "intermediate" || v === "advanced";

export const Route = createFileRoute("/_authenticated/teacher/content/")({
  head: () => ({ meta: [{ title: "Contenido — Profesor" }] }),
  // El nivel va en la URL y no en estado local: entrar a un módulo y volver
  // desmonta esta pantalla, y con `useState` el profe que estaba en intermedio
  // aparecía de vuelta en básico cada vez.
  validateSearch: (s: Record<string, unknown>) => ({
    level: ES_NIVEL(s.level) ? s.level : undefined,
    studentId: typeof s.studentId === "string" && s.studentId ? s.studentId : undefined,
  }),
  component: TeacherContent,
});

const LEVELS: Array<{ id: EnglishLevel; label: string }> = [
  { id: "beginner", label: "Beginner (A1–A2)" },
  { id: "intermediate", label: "Intermediate (B1–B2)" },
  { id: "advanced", label: "Advanced (C1)" },
];

/**
 * Catálogo de contenido para el profesor: puede abrir cualquier módulo y ver
 * los slides completos, esté o no habilitado para sus estudiantes (el backend
 * ya entrega el contenido sin compuertas a profes y admin).
 *
 * Si elige un estudiante, el visor además muestra qué tiene abierto ese
 * estudiante y deja habilitar/bloquear lección por lección sin salir de ahí.
 */
function TeacherContent() {
  const { level: levelUrl, studentId: studentIdUrl } = Route.useSearch();
  const navigate = useNavigate();
  const level: EnglishLevel = levelUrl ?? "beginner";
  const { alumnoId: studentId, elegir: recordarAlumno } = useAlumnoEnClase(studentIdUrl);
  const setLevel = (id: EnglishLevel) =>
    navigate({ to: "/teacher/content", search: (s: any) => ({ ...s, level: id }), replace: true });
  // Cambiar de alumno también tiene que tocar la URL, igual que en el visor del
  // módulo: si no, se vuelve aquí desde un módulo con `?studentId=` puesto y la
  // dirección seguiría anunciando al alumno anterior.
  const elegir = (id: string) => {
    recordarAlumno(id);
    navigate({
      to: "/teacher/content",
      search: (s: any) => ({ ...s, studentId: id || undefined }),
      replace: true,
    });
  };

  const modsQ = useQuery({
    queryKey: ["learning", "modules", level],
    queryFn: () => learningApi.modules(level),
  });

  // Avance del alumno por módulo: lo recorrido de su LECCIÓN INTERACTIVA, que
  // es la que se da en clase. Sirve para saber de un vistazo en qué módulo iban,
  // sin abrirlos uno a uno.
  //
  // Solo esa: la actividad extra la hace el alumno por su cuenta y la guía es
  // material de apoyo, y ninguna de las dos reporta posición de slide, así que
  // promediando las tres el módulo se quedaba clavado en 33% aunque estuviera
  // terminado.
  const planQ = useQuery({
    queryKey: ["teacher", "lesson-plan", studentId],
    queryFn: () => teachersApi.lessonPlan(studentId!),
    enabled: !!studentId,
  });
  const avancePorModulo = useMemo(() => {
    const m = new Map<string, number>();
    for (const mod of planQ.data ?? []) {
      const ls = leccionesInteractivas(
        (mod.lessons ?? []).map((l: any) => ({ ...l, id: l.lessonId })),
      );
      if (ls.length === 0) continue;
      const suma = ls.reduce((a: number, l: { progreso?: number }) => a + (l.progreso ?? 0), 0);
      m.set(mod.moduleId, suma / ls.length);
    }
    return m;
  }, [planQ.data]);

  const mods = (modsQ.data ?? []) as any[];
  const grupos = groupByUnit(mods);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Contenido" highlight="Contenido">
        Revisa los slides y actividades de cualquier módulo. Elige un estudiante para ver qué
        tiene habilitado y abrirle o cerrarle lecciones desde el mismo visor.
      </PageHeader>

      <div role="group" aria-label="Nivel" className="flex flex-wrap gap-2">
        {LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            aria-pressed={level === l.id}
            onClick={() => setLevel(l.id)}
            className={pillClass(level === l.id)}
          >
            {level === l.id ? <Check className="size-3.5" aria-hidden="true" /> : null}
            {l.label}
          </button>
        ))}
      </div>

      <BarraAlumnoEnClase alumnoId={studentId} onElegir={elegir} />

      {modsQ.isLoading ? (
        <Cargando>Cargando contenido…</Cargando>
      ) : modsQ.isError ? (
        <EstadoError onRetry={() => void modsQ.refetch()}>No pudimos cargar el contenido. Revisa tu conexión e inténtalo de nuevo.</EstadoError>
      ) : mods.length === 0 ? (
        <Vacio titulo="Aún no hay módulos">Todavía no hay módulos publicados en este nivel.</Vacio>
      ) : (
        grupos.map(([unit, group]) => (
          <section key={String(unit)}>
            {unit != null ? (
              <SeccionTitulo className="mb-3 text-[15px]">Unidad {unit}</SeccionTitulo>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((m: any) => (
                <Link
                  key={m.id}
                  to="/teacher/content/$moduleId"
                  params={{ moduleId: m.id }}
                  // El nivel viaja con el enlace para que "Volver al contenido"
                  // devuelva a la pestaña desde la que se entró.
                  search={{ ...(studentId ? { studentId } : {}), level } as any}
                  className={cn("block border-2 border-brand-ink bg-white p-5 no-underline transition-colors hover:bg-brand-cream-soft", focusRing)}
                >
                  <div className="flex items-start justify-between">
                    <span aria-hidden="true" className="grid size-11 place-items-center border-2 border-brand-ink bg-brand-yellow-soft text-brand-ink">
                      <BookOpen className="size-5" />
                    </span>
                    <span className={tagNeutral}>
                      {m.lessons?.length ?? 0} lecciones
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-[18px] font-extrabold uppercase leading-tight text-brand-ink">{m.title}</h3>
                  <p className="mt-1 text-sm text-brand-ink/80">{m.summary ?? m.description}</p>
                  {/* Barra de avance del alumno seleccionado, al pie de la
                      tarjeta — como la franja roja de una miniatura de video. */}
                  {studentId && (avancePorModulo.get(m.id) ?? 0) > 0 ? (
                    <div className="mt-4">
                      <div className="h-2 overflow-hidden border border-brand-ink bg-white">
                        <div
                          className="h-full bg-brand-ink"
                          style={{ width: `${Math.round((avancePorModulo.get(m.id) ?? 0) * 100)}%` }}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-brand-ink/70">
                        Trabajado al {Math.round((avancePorModulo.get(m.id) ?? 0) * 100)}%
                      </div>
                    </div>
                  ) : null}
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

/** Agrupa módulos por `unit` conservando el orden de `position`. */
function groupByUnit(mods: any[]): Array<[number | null, any[]]> {
  const map = new Map<number | null, any[]>();
  for (const m of mods) {
    const k = (m.unit ?? null) as number | null;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(m);
  }
  return [...map.entries()].sort((a, b) => (a[0] ?? 1e9) - (b[0] ?? 1e9));
}
