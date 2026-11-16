import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { teachersApi } from "@/lib/api/endpoints";
import type { EnglishLevel } from "@/lib/domain/types";
import { LessonFrame } from "@/components/learning/LessonFrame";
import { cn } from "@/lib/utils";
import { Cargando, EstadoError, Titulo, eyebrow, focusRing } from "@/components/app/AppUi";

const ES_NIVEL = (v: unknown): v is EnglishLevel =>
  v === "beginner" || v === "intermediate" || v === "advanced";

export const Route = createFileRoute("/_authenticated/teacher/material/$resourceId")({
  head: () => ({ meta: [{ title: "Material extra — Profesor" }] }),
  // El nivel viaja con el enlace sólo para poder devolver al profe al mismo
  // filtro del que salió.
  validateSearch: (s: Record<string, unknown>) => ({
    level: ES_NIVEL(s.level) ? s.level : undefined,
  }),
  component: TeacherMaterialDetail,
});

/**
 * Visor de un recurso. Reutiliza `LessonFrame` tal cual: ya trae el modal de
 * vista ampliada y el saneado del HTML, y su firma no sabe nada de lecciones.
 */
function TeacherMaterialDetail() {
  const { resourceId } = useParams({ from: "/_authenticated/teacher/material/$resourceId" });
  const { level } = Route.useSearch();
  const q = useQuery({
    queryKey: ["teacher", "resources", resourceId],
    queryFn: () => teachersApi.resource(resourceId),
  });

  return (
    <div className="flex flex-col gap-4">
      <Link to="/teacher/material" search={{ level }} className={cn("inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-bold text-brand-ink underline underline-offset-2", focusRing)}>
        <ArrowLeft className="size-4" /> Material extra
      </Link>

      {q.isLoading ? (
        <Cargando>Cargando material…</Cargando>
      ) : q.isError || !q.data ? (
        <EstadoError onRetry={() => void q.refetch()}>No pudimos abrir este material.</EstadoError>
      ) : (
        <>
          <header>
            <Titulo className="text-[28px] md:text-[34px]">{q.data.title}</Titulo>
            {q.data.description ? (
              <p className="mt-1 max-w-2xl text-[15px] text-brand-ink/80">{q.data.description}</p>
            ) : null}
          </header>
          {/* El objetivo va AL LADO del material, no encima: la idea es leerlo
              mientras se hojea y decidir si sirve sin pasarse todos los slides.
              Nada de `transform`/`filter`/`contain` en este contenedor — al
              ampliar, `LessonFrame` se vuelve `fixed inset-0 z-50` y cualquiera
              de esas propiedades lo dejaría atrapado dentro de la columna. */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <LessonFrame title={q.data.title} html={q.data.contentHtml} />
            </div>
            {q.data.objective ? (
              <aside className="border-2 border-brand-ink bg-white p-5 lg:h-[72vh] lg:w-80 lg:shrink-0 lg:overflow-y-auto">
                <h2 className={eyebrow}>
                  ¿Para qué sirve?
                </h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-brand-ink">
                  {q.data.objective}
                </p>
              </aside>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
