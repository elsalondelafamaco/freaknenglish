import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { learningApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/app/reports/$reportId")({
  head: () => ({ meta: [{ title: "Reporte — FreaknEnglish" }] }),
  component: DetalleReporte,
});

const NIVEL: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

/** Lectura de un reporte. Los campos vacíos no se pintan. */
function DetalleReporte() {
  const { reportId } = useParams({ from: "/_authenticated/app/reports/$reportId" });
  const q = useQuery({
    queryKey: ["me", "reports", reportId],
    queryFn: () => learningApi.myReport(reportId),
  });
  const r = q.data;

  const bloques = r
    ? ([
        ["Fortalezas", r.strengths],
        ["Por mejorar", r.improvements],
        ["Recomendación", r.recommendation],
      ] as const).filter(([, v]) => !!v)
    : [];

  return (
    <div className="flex flex-col gap-5">
      <Link to="/app/reports" className="inline-flex w-fit items-center gap-1.5 text-sm text-brand-ink/60 hover:text-brand-ink">
        <ArrowLeft className="size-4" /> Mis reportes
      </Link>

      {q.isLoading ? (
        <div className="text-sm text-brand-ink/60">Cargando…</div>
      ) : q.isError || !r ? (
        <div className="rounded-2xl border border-dashed border-brand-line bg-white p-8 text-center text-sm text-brand-ink/65">
          No pudimos abrir este reporte.
        </div>
      ) : (
        <>
          <header className="rounded-3xl border border-brand-line bg-gradient-to-br from-brand-yellow/60 to-brand-yellow-soft p-6 md:p-8">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-brand-ink">
              Reporte de progreso
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-brand-ink md:text-3xl">{r.periodLabel}</h1>
            <p className="mt-1 text-sm text-brand-ink/70">
              {r.teacher?.fullName ? `Escrito por ${r.teacher.fullName}` : ""}
              {r.publishedAt
                ? ` · ${new Date(r.publishedAt).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}`
                : ""}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-brand-ink">
              {r.level ? (
                <span className="rounded-full bg-white/80 px-3 py-1">Nivel: {NIVEL[r.level] ?? r.level}</span>
              ) : null}
              {r.classesTaken != null ? (
                <span className="rounded-full bg-white/80 px-3 py-1">
                  Clases: {r.classesTaken}
                  {r.classesTotal != null ? ` de ${r.classesTotal}` : ""}
                </span>
              ) : null}
            </div>
          </header>

          {r.comment ? (
            <section className="rounded-2xl border border-brand-line bg-white p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-ink/60">
                Mensaje de tu profe
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-brand-ink">{r.comment}</p>
            </section>
          ) : null}

          {bloques.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {bloques.map(([titulo, texto]) => (
                <section key={titulo} className="rounded-2xl border border-brand-line bg-white p-5">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-ink/60">{titulo}</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-brand-ink">{texto}</p>
                </section>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
