import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { learningApi } from "@/lib/api/endpoints";
import {
  Cargando,
  EstadoError,
  SeccionTitulo,
  Titulo,
  cardPlain,
  cardPrimary,
  eyebrow,
  focusRing,
  tagNeutral,
} from "@/components/app/AppUi";
import { cn } from "@/lib/utils";

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
    <div className="flex max-w-3xl flex-col gap-5">
      <Link
        to="/app/reports"
        className={cn("inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-bold text-brand-ink underline-offset-2 hover:underline", focusRing)}
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Tus reportes
      </Link>

      {q.isLoading ? (
        <Cargando>Cargando el reporte…</Cargando>
      ) : q.isError || !r ? (
        <EstadoError onRetry={() => void q.refetch()}>No pudimos abrir este reporte.</EstadoError>
      ) : (
        <>
          <header className={cn(cardPrimary, "p-5 md:p-6")}>
            <p className={eyebrow}>Reporte de progreso</p>
            <Titulo className="mt-1.5 text-[28px] md:text-[34px]">{r.periodLabel}</Titulo>
            <p className="mt-2 text-sm text-brand-ink/80">
              {r.teacher?.fullName ? `Escrito por ${r.teacher.fullName}` : ""}
              {r.publishedAt
                ? ` · ${new Date(r.publishedAt).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}`
                : ""}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {r.level ? <span className={tagNeutral}>Nivel: {NIVEL[r.level] ?? r.level}</span> : null}
              {r.classesTaken != null ? (
                <span className={tagNeutral}>
                  Clases: {r.classesTaken}
                  {r.classesTotal != null ? ` de ${r.classesTotal}` : ""}
                </span>
              ) : null}
            </div>
          </header>

          {r.comment ? (
            <section className={cn(cardPlain, "p-5")} aria-labelledby="mensaje-profe">
              <SeccionTitulo id="mensaje-profe" className="text-[15px]">Mensaje de tu profe</SeccionTitulo>
              <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-brand-ink">{r.comment}</p>
            </section>
          ) : null}

          {bloques.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {bloques.map(([titulo, texto]) => (
                <section key={titulo} className={cn(cardPlain, "p-5")} aria-label={titulo}>
                  <SeccionTitulo className="text-[15px]">{titulo}</SeccionTitulo>
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
