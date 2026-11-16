import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileBarChart } from "lucide-react";
import { learningApi } from "@/lib/api/endpoints";
import { Cargando, EstadoError, PageHeader, Vacio, cardPlain, eyebrow, focusRing } from "@/components/app/AppUi";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/reports/")({
  head: () => ({ meta: [{ title: "Mis reportes — FreaknEnglish" }] }),
  component: MisReportes,
});

const NIVEL: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

/** Reportes de progreso que le escribió su profesor. Sólo los publicados. */
function MisReportes() {
  const q = useQuery({ queryKey: ["me", "reports"], queryFn: () => learningApi.myReports() });
  const items = q.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Tus reportes" highlight="reportes">
        Cómo vas, en palabras de tu profe: qué llevas fuerte, qué conviene reforzar y hacia dónde
        seguir.
      </PageHeader>

      {q.isLoading ? (
        <Cargando>Cargando tus reportes…</Cargando>
      ) : q.isError ? (
        <EstadoError onRetry={() => void q.refetch()}>
          No pudimos cargar tus reportes. Revisa tu conexión e inténtalo de nuevo.
        </EstadoError>
      ) : items.length === 0 ? (
        <Vacio titulo="Aún no hay reportes">
          Todavía no tienes reportes. Tu profe te avisará cuando escriba el primero.
        </Vacio>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {items.map((r) => (
            <li key={r.id} className="flex">
              <Link
                to="/app/reports/$reportId"
                params={{ reportId: r.id }}
                className={cn(
                  cardPlain,
                  "group flex w-full flex-col gap-1.5 p-4 no-underline transition-colors hover:bg-brand-cream-soft",
                  focusRing,
                )}
              >
                <span className="inline-flex size-9 items-center justify-center rounded-full border-2 border-brand-ink bg-white text-brand-ink">
                  <FileBarChart className="size-4" aria-hidden="true" />
                </span>
                <span className="mt-1 font-bold text-brand-ink group-hover:underline">{r.periodLabel}</span>
                <span className={cn(eyebrow, "!tracking-[0.1em]")}>
                  {r.teacher?.fullName ?? "Tu profe"}
                  {r.level ? ` · ${NIVEL[r.level] ?? r.level}` : ""}
                  {r.publishedAt
                    ? ` · ${new Date(r.publishedAt).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}`
                    : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
