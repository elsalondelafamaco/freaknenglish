import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, Link2 } from "lucide-react";
import { learningApi } from "@/lib/api/endpoints";
import { Cargando, EstadoError, PageHeader, Vacio, cardPlain, eyebrow, focusRing } from "@/components/app/AppUi";
import { cn } from "@/lib/utils";

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
      <PageHeader title="Tu material" highlight="material">
        Guías, enlaces y archivos que tu profe preparó para ti. Ábrelos cuando quieras repasar.
      </PageHeader>

      {q.isLoading ? (
        <Cargando>Cargando tu material…</Cargando>
      ) : q.isError ? (
        <EstadoError onRetry={() => void q.refetch()}>
          No pudimos cargar tu material. Revisa tu conexión e inténtalo de nuevo.
        </EstadoError>
      ) : items.length === 0 ? (
        <Vacio titulo="Aún no hay material">
          Tu profe todavía no te ha compartido material. Cuando lo haga, aparecerá aquí.
        </Vacio>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {items.map((m) => (
            <li key={m.id} className="flex">
              <a
                href={m.url}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  cardPlain,
                  "group flex w-full flex-col gap-1.5 p-4 no-underline transition-colors hover:bg-brand-cream-soft",
                  focusRing,
                )}
              >
                <span className="inline-flex size-9 items-center justify-center rounded-full border-2 border-brand-ink bg-white text-brand-ink">
                  {m.kind === "file" ? <FileText className="size-4" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}
                </span>
                <span className="mt-1 flex items-center gap-1.5 font-bold text-brand-ink group-hover:underline">
                  {m.title}
                  <ExternalLink className="size-3.5 opacity-60" aria-hidden="true" />
                  <span className="sr-only">(se abre en una pestaña nueva)</span>
                </span>
                {m.description ? <span className="text-sm text-brand-ink/80">{m.description}</span> : null}
                <span className={cn(eyebrow, "mt-1 !tracking-[0.1em]")}>
                  {m.kind === "file" ? "Archivo" : "Enlace"}
                  {m.sizeBytes ? ` · ${pesoLegible(m.sizeBytes)}` : ""}
                  {m.teacher?.fullName ? ` · ${m.teacher.fullName}` : ""}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
