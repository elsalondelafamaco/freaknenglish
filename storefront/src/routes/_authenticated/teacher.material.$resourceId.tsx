import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { teachersApi } from "@/lib/api/endpoints";
import { LessonFrame } from "@/components/learning/LessonFrame";

export const Route = createFileRoute("/_authenticated/teacher/material/$resourceId")({
  head: () => ({ meta: [{ title: "Material extra — Profesor" }] }),
  component: TeacherMaterialDetail,
});

/**
 * Visor de un recurso. Reutiliza `LessonFrame` tal cual: ya trae el modal de
 * vista ampliada y el saneado del HTML, y su firma no sabe nada de lecciones.
 */
function TeacherMaterialDetail() {
  const { resourceId } = useParams({ from: "/_authenticated/teacher/material/$resourceId" });
  const q = useQuery({
    queryKey: ["teacher", "resources", resourceId],
    queryFn: () => teachersApi.resource(resourceId),
  });

  return (
    <div className="flex flex-col gap-4">
      <Link to="/teacher/material" className="inline-flex w-fit items-center gap-1.5 text-sm text-brand-ink/60 hover:text-brand-ink">
        <ArrowLeft className="size-4" /> Material extra
      </Link>

      {q.isLoading ? (
        <div className="text-sm text-brand-ink/60">Cargando…</div>
      ) : q.isError || !q.data ? (
        <div className="rounded-2xl border border-dashed border-brand-line bg-white p-8 text-center text-sm text-brand-ink/65">
          No pudimos abrir este material.
        </div>
      ) : (
        <>
          <header>
            <h1 className="text-2xl font-bold tracking-tight text-brand-ink md:text-3xl">{q.data.title}</h1>
            {q.data.description ? (
              <p className="mt-1 max-w-2xl text-[15px] text-brand-ink/65">{q.data.description}</p>
            ) : null}
          </header>
          <LessonFrame title={q.data.title} html={q.data.contentHtml} />
        </>
      )}
    </div>
  );
}
