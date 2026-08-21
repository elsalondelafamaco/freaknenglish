import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileBarChart } from "lucide-react";
import { learningApi } from "@/lib/api/endpoints";

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
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">Mis reportes</h1>
        <p className="mt-2 max-w-2xl text-[15px] text-brand-ink/65">
          Cómo vas, en palabras de tu profe: qué llevas fuerte, qué conviene reforzar y hacia dónde
          seguir.
        </p>
      </header>

      {q.isLoading ? (
        <div className="text-sm text-brand-ink/60">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-line bg-white p-8 text-center text-sm text-brand-ink/65">
          Todavía no tienes reportes. Tu profe te avisará cuando escriba el primero.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((r) => (
            <Link
              key={r.id}
              to="/app/reports/$reportId"
              params={{ reportId: r.id }}
              className="group flex flex-col gap-1.5 rounded-2xl border border-brand-line bg-white p-5 transition hover:border-brand-ink/30 hover:shadow-soft"
            >
              <span className="inline-flex size-9 items-center justify-center rounded-xl bg-brand-cream text-brand-ink">
                <FileBarChart className="size-4" />
              </span>
              <span className="mt-1 font-semibold text-brand-ink group-hover:underline">{r.periodLabel}</span>
              <span className="text-[10px] uppercase tracking-wide text-brand-ink/45">
                {r.teacher?.fullName ?? "Tu profe"}
                {r.level ? ` · ${NIVEL[r.level] ?? r.level}` : ""}
                {r.publishedAt
                  ? ` · ${new Date(r.publishedAt).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}`
                  : ""}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
