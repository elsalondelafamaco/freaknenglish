import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Search } from "lucide-react";
import { teachersApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/teacher/material/")({
  head: () => ({ meta: [{ title: "Material extra — Profesor" }] }),
  component: TeacherMaterial,
});

/**
 * Material de apoyo para profesores: HTMLs que sube el admin con temas
 * puntuales (gramática, pronunciación, dinámicas). No es contenido de curso,
 * así que no aparece en ningún catálogo del estudiante — la ruta cuelga de
 * `/teacher`, que ya exige el rol.
 */
function TeacherMaterial() {
  const [q, setQ] = useState("");
  const listQ = useQuery({ queryKey: ["teacher", "resources"], queryFn: () => teachersApi.resources() });

  const grupos = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtrados = (listQ.data ?? []).filter((r) =>
      !term ||
      r.title.toLowerCase().includes(term) ||
      (r.description ?? "").toLowerCase().includes(term) ||
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
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">Material extra</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-brand-ink/65">
            Recursos de apoyo para tus clases. Ábrelos y compártelos en pantalla cuando un tema
            necesite refuerzo.
          </p>
        </div>
        <label className="relative w-full md:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-ink/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar material…"
            className="w-full rounded-xl border border-brand-line bg-white py-2 pl-9 pr-3 text-sm text-brand-ink focus:border-brand-ink focus:outline-none"
          />
        </label>
      </header>

      {listQ.isLoading ? (
        <div className="text-sm text-brand-ink/60">Cargando…</div>
      ) : grupos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-line bg-white p-8 text-center text-sm text-brand-ink/65">
          {q ? "Ningún material coincide con la búsqueda." : "Todavía no hay material extra publicado."}
        </div>
      ) : (
        grupos.map(([categoria, items]) => (
          <section key={categoria} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-ink/60">{categoria}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((r) => (
                <Link
                  key={r.id}
                  to="/teacher/material/$resourceId"
                  params={{ resourceId: r.id }}
                  className="group flex flex-col gap-1.5 rounded-2xl border border-brand-line bg-white p-4 transition hover:border-brand-ink/30 hover:shadow-soft"
                >
                  <span className="inline-flex size-9 items-center justify-center rounded-xl bg-brand-cream text-brand-ink">
                    <BookOpen className="size-4" />
                  </span>
                  <span className="mt-1 font-semibold text-brand-ink group-hover:underline">{r.title}</span>
                  {r.description ? (
                    <span className="line-clamp-2 text-sm text-brand-ink/65">{r.description}</span>
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
