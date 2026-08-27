import { useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { learningApi, teachersApi } from "@/lib/api/endpoints";
import { BarraAlumnoEnClase, useAlumnoEnClase } from "@/components/learning/AlumnoEnClase";
import type { EnglishLevel } from "@/lib/domain/types";

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

  // Avance del alumno por módulo: promedio de lo recorrido en sus lecciones.
  // Sirve para saber de un vistazo en qué módulo iban, sin abrirlos uno a uno.
  const planQ = useQuery({
    queryKey: ["teacher", "lesson-plan", studentId],
    queryFn: () => teachersApi.lessonPlan(studentId!),
    enabled: !!studentId,
  });
  const avancePorModulo = useMemo(() => {
    const m = new Map<string, number>();
    for (const mod of planQ.data ?? []) {
      const ls = mod.lessons ?? [];
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
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">Contenido</h1>
        <p className="mt-2 max-w-2xl text-[15px] text-brand-ink/65">
          Revisa los slides y actividades de cualquier módulo. Elige un estudiante para ver qué
          tiene habilitado y abrirle o cerrarle lecciones desde el mismo visor.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLevel(l.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                level === l.id
                  ? "bg-brand-ink text-white"
                  : "border border-brand-line bg-white text-brand-ink/70 hover:bg-brand-cream/50"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <BarraAlumnoEnClase alumnoId={studentId} onElegir={elegir} />

      {modsQ.isLoading ? (
        <p className="text-sm text-brand-ink/55">Cargando contenido…</p>
      ) : mods.length === 0 ? (
        <p className="text-sm text-brand-ink/55">Todavía no hay módulos publicados en este nivel.</p>
      ) : (
        grupos.map(([unit, group]) => (
          <section key={String(unit)}>
            {unit != null ? (
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-brand-ink/55">
                Unidad {unit}
              </h2>
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
                  className="rounded-3xl border border-brand-line bg-white p-5 transition hover:border-brand-ink/30 hover:shadow-soft"
                >
                  <div className="flex items-start justify-between">
                    <div className="text-3xl">{m.coverEmoji ?? "📘"}</div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-cream px-2.5 py-1 text-[11px] font-medium text-brand-ink/65">
                      <BookOpen className="size-3.5" /> {m.lessons?.length ?? 0} lecciones
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-bold text-brand-ink">{m.title}</h3>
                  <p className="mt-1 text-sm text-brand-ink/65">{m.summary ?? m.description}</p>
                  {/* Barra de avance del alumno seleccionado, al pie de la
                      tarjeta — como la franja roja de una miniatura de video. */}
                  {studentId && (avancePorModulo.get(m.id) ?? 0) > 0 ? (
                    <div className="mt-4">
                      <div className="h-1.5 overflow-hidden rounded-full bg-brand-ink/10">
                        <div
                          className="h-full rounded-full bg-brand-yellow"
                          style={{ width: `${Math.round((avancePorModulo.get(m.id) ?? 0) * 100)}%` }}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-brand-ink/50">
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
