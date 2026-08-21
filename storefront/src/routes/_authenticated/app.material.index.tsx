import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, Link2 } from "lucide-react";
import { learningApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/app/material/")({
  head: () => ({ meta: [{ title: "Mi material — FreaknEnglish" }] }),
  component: MiMaterial,
});

const pesoLegible = (b: number | null) =>
  b == null ? "" : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/**
 * Material que el profesor le deja al estudiante: links y PDFs de refuerzo.
 * Es material personal —lo que su profe le mandó a él— y no el catálogo del
 * curso, que vive en Aprendizaje.
 */
function MiMaterial() {
  const q = useQuery({ queryKey: ["me", "resources"], queryFn: () => learningApi.myResources() });
  const items = q.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">Mi material</h1>
        <p className="mt-2 max-w-2xl text-[15px] text-brand-ink/65">
          Guías, enlaces y archivos que tu profe preparó para ti. Ábrelos cuando quieras repasar.
        </p>
      </header>

      {q.isLoading ? (
        <div className="text-sm text-brand-ink/60">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-line bg-white p-8 text-center text-sm text-brand-ink/65">
          Tu profe todavía no te ha compartido material. Cuando lo haga, aparecerá aquí.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((m) => (
            <a
              key={m.id}
              href={m.url}
              target="_blank"
              rel="noreferrer"
              className="group flex flex-col gap-1.5 rounded-2xl border border-brand-line bg-white p-5 transition hover:border-brand-ink/30 hover:shadow-soft"
            >
              <span className="inline-flex size-9 items-center justify-center rounded-xl bg-brand-cream text-brand-ink">
                {m.kind === "file" ? <FileText className="size-4" /> : <Link2 className="size-4" />}
              </span>
              <span className="mt-1 flex items-center gap-1.5 font-semibold text-brand-ink group-hover:underline">
                {m.title}
                <ExternalLink className="size-3.5 opacity-0 transition group-hover:opacity-60" />
              </span>
              {m.description ? <span className="text-sm text-brand-ink/65">{m.description}</span> : null}
              <span className="mt-1 text-[10px] uppercase tracking-wide text-brand-ink/45">
                {m.kind === "file" ? "Archivo" : "Enlace"}
                {m.sizeBytes ? ` · ${pesoLegible(m.sizeBytes)}` : ""}
                {m.teacher?.fullName ? ` · ${m.teacher.fullName}` : ""}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
