import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Check, Search } from "lucide-react";
import { teachersApi } from "@/lib/api/endpoints";
import type { EnglishLevel } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { Cargando, EstadoError, PageHeader, SeccionTitulo, Vacio, focusRing } from "@/components/app/AppUi";
import { inputBase, pillClass } from "@/components/teacher/TeacherUi";

const ES_NIVEL = (v: unknown): v is EnglishLevel =>
  v === "beginner" || v === "intermediate" || v === "advanced";

export const Route = createFileRoute("/_authenticated/teacher/material/")({
  head: () => ({ meta: [{ title: "Material extra — Profesor" }] }),
  // Mismo criterio que el catálogo de contenido: el nivel va en la URL, porque
  // abrir un material y volver desmonta esta pantalla y con estado local el
  // profe perdía el filtro cada vez.
  validateSearch: (s: Record<string, unknown>) => ({
    level: ES_NIVEL(s.level) ? s.level : undefined,
  }),
  component: TeacherMaterial,
});

const NIVELES: Array<{ id: EnglishLevel | ""; label: string }> = [
  { id: "", label: "Todos" },
  { id: "beginner", label: "Beginner (A1–A2)" },
  { id: "intermediate", label: "Intermediate (B1–B2)" },
  { id: "advanced", label: "Advanced (C1)" },
];

/**
 * Material de apoyo para profesores: HTMLs que sube el admin con temas
 * puntuales (gramática, pronunciación, dinámicas). No es contenido de curso,
 * así que no aparece en ningún catálogo del estudiante — la ruta cuelga de
 * `/teacher`, que ya exige el rol.
 *
 * Se filtra por nivel y, dentro de cada nivel, se agrupa por categoría. El
 * material sin nivel sale en todos: sirve para los tres.
 */
function TeacherMaterial() {
  const [q, setQ] = useState("");
  const { level } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const listQ = useQuery({
    queryKey: ["teacher", "resources", level ?? "todos"],
    queryFn: () => teachersApi.resources(level),
  });

  const grupos = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtrados = (listQ.data ?? []).filter((r) =>
      !term ||
      r.title.toLowerCase().includes(term) ||
      (r.description ?? "").toLowerCase().includes(term) ||
      // El objetivo también: es donde está el "para qué", que suele ser por lo
      // que el profe busca ("irregulares", "soltar al alumno"…).
      (r.objective ?? "").toLowerCase().includes(term) ||
      (r.category ?? "").toLowerCase().includes(term),
    );
    const map = new Map<string, typeof filtrados>();
    for (const r of filtrados) {
      const k = r.category?.trim() || "General";
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return Array.from(map.entries());
  }, [listQ.data, q]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Material extra"
        highlight="extra"
        aside={
          <label className="relative block w-full md:w-72">
            <span className="sr-only">Buscar material</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-ink/60" aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar material…"
              className={cn(inputBase, "pl-9")}
            />
          </label>
        }
      >
        Recursos de apoyo para tus clases. Ábrelos y compártelos en pantalla cuando un tema
        necesite refuerzo.
      </PageHeader>

      <div role="group" aria-label="Nivel" className="flex flex-wrap gap-2">
        {NIVELES.map((n) => {
          const activo = (level ?? "") === n.id;
          return (
            <button
              key={n.id || "todos"}
              type="button"
              aria-pressed={activo}
              onClick={() => navigate({ search: { level: n.id || undefined }, replace: true })}
              className={pillClass(activo)}
            >
              {activo ? <Check className="size-3.5" aria-hidden="true" /> : null}
              {n.label}
            </button>
          );
        })}
      </div>

      {listQ.isLoading ? (
        <Cargando>Cargando material…</Cargando>
      ) : listQ.isError ? (
        <EstadoError onRetry={() => void listQ.refetch()}>No pudimos cargar el material. Revisa tu conexión e inténtalo de nuevo.</EstadoError>
      ) : grupos.length === 0 ? (
        <Vacio titulo={q ? "Sin resultados" : "Aún no hay material"}>
          {q ? "Ningún material coincide con la búsqueda." : "Todavía no hay material extra publicado."}
        </Vacio>
      ) : (
        grupos.map(([categoria, items]) => (
          <section key={categoria} className="flex flex-col gap-2">
            <SeccionTitulo className="text-[15px]">{categoria}</SeccionTitulo>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((r) => (
                <Link
                  key={r.id}
                  to="/teacher/material/$resourceId"
                  params={{ resourceId: r.id }}
                  search={{ level }}
                  className={cn("group flex flex-col gap-1.5 border-2 border-brand-ink bg-white p-4 no-underline transition-colors hover:bg-brand-cream-soft", focusRing)}
                >
                  <span aria-hidden="true" className="inline-flex size-9 items-center justify-center border-2 border-brand-ink bg-brand-yellow-soft text-brand-ink">
                    <BookOpen className="size-4" />
                  </span>
                  <span className="mt-1 font-semibold text-brand-ink group-hover:underline">{r.title}</span>
                  {r.description ? (
                    <span className="line-clamp-2 text-sm text-brand-ink/80">{r.description}</span>
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
