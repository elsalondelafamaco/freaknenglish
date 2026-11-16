import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { adminApi } from "@/lib/api/endpoints";
import { Cargando, EstadoError, PageHeader, Vacio } from "@/components/app/AppUi";
import { inputBase, td, th } from "@/components/teacher/TeacherUi";
import { ChipEstado, Kpi, Segmentado } from "@/components/admin/AdminUi";

export const Route = createFileRoute("/_authenticated/admin/surveys")({
  head: () => ({
    meta: [
      { title: "Encuestas — Admin Freakn'" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminSurveys,
});

function avg(nums: number[]): string {
  if (nums.length === 0) return "—";
  const a = nums.reduce((s, n) => s + n, 0) / nums.length;
  return a.toFixed(1);
}

const FILTROS = [
  { valor: "all" as const, texto: "Todas" },
  { valor: "promoters" as const, texto: "Promotores (9-10)" },
  { valor: "detractors" as const, texto: "Detractores (0-6)" },
];

function AdminSurveys() {
  const [filter, setFilter] = useState<"all" | "detractors" | "promoters">("all");
  const [month, setMonth] = useState("");
  const [orderBy, setOrderBy] = useState<"recent" | "oldest" | "score_desc" | "score_asc">("recent");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "surveys", filter, month, orderBy],
    queryFn: () => adminApi.surveys({ filter, month: month || undefined, orderBy }),
  });
  const rows = data?.rows ?? [];
  const totals = data?.totals;
  const nps = totals?.nps == null ? "—" : String(totals.nps);
  const fmtMonth = (p: string) => {
    const [y, m] = p.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrowText="Admin · Operación" title="Encuestas" highlight="Encuestas">
        Respuestas de la encuesta de satisfacción (NPS) que se envía antes de la última clase del periodo o al terminar
        la mensualidad. Solo las ve el admin.
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi etiqueta="NPS" valor={nps} ayuda="De -100 a 100: promotores menos detractores." />
        <Kpi etiqueta="Respuestas" valor={String(totals?.count ?? 0)} />
        <Kpi
          etiqueta="Profesor (1-5)"
          valor={avg(rows.map((s) => s.teacherScore ?? 0).filter(Boolean))}
        />
        <Kpi
          etiqueta="Contenido (1-5)"
          valor={avg(rows.map((s) => s.contentScore ?? 0).filter(Boolean))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Segmentado etiqueta="Filtrar respuestas" opciones={FILTROS} valor={filter} onChange={setFilter} />
        {/* Mes: para conocer el NPS de un mes puntual */}
        <select
          aria-label="Mes"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className={`${inputBase} w-auto`}
        >
          <option value="">Todos los meses</option>
          {(data?.periods ?? []).map((p) => (
            <option key={p} value={p}>{fmtMonth(p)}</option>
          ))}
        </select>
        <select
          aria-label="Orden"
          value={orderBy}
          onChange={(e) => setOrderBy(e.target.value as typeof orderBy)}
          className={`${inputBase} w-auto`}
        >
          <option value="recent">Más recientes</option>
          <option value="oldest">Más antiguas</option>
          <option value="score_desc">Mayor puntaje</option>
          <option value="score_asc">Menor puntaje</option>
        </select>
        {month ? (
          <ChipEstado atencion>
            NPS de {fmtMonth(month)}: {nps}
          </ChipEstado>
        ) : null}
      </div>

      {isError ? (
        <EstadoError onRetry={() => void refetch()}>No pudimos cargar las encuestas.</EstadoError>
      ) : isLoading ? (
        <Cargando>Cargando encuestas…</Cargando>
      ) : rows.length === 0 ? (
        <Vacio titulo="Sin respuestas">Aún no hay respuestas con este filtro.</Vacio>
      ) : (
        <div className="overflow-x-auto border-2 border-brand-ink bg-white">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <th className={th}>Estudiante</th>
                <th className={th}>Fecha</th>
                <th className={`${th} text-center`}>NPS</th>
                <th className={`${th} text-center`}>Profesor</th>
                <th className={`${th} text-center`}>Contenido</th>
                <th className={`${th} text-center`}>Plataforma</th>
                <th className={th}>Comentario</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="align-top">
                  <td className={td}>
                    <div className="font-bold">{s.user.fullName}</div>
                    <div className="text-xs text-brand-ink/70">{s.user.email}</div>
                  </td>
                  <td className={`${td} text-brand-ink/80`}>
                    {new Date(s.createdAt).toLocaleDateString("es-CO", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className={`${td} text-center`}>
                    <NpsPill score={s.score} />
                  </td>
                  <td className={`${td} text-center font-mono text-xs`}>{s.teacherScore ?? "—"}</td>
                  <td className={`${td} text-center font-mono text-xs`}>{s.contentScore ?? "—"}</td>
                  <td className={`${td} text-center font-mono text-xs`}>{s.platformScore ?? "—"}</td>
                  <td className={td}>
                    {s.comment ? (
                      <span className="inline-flex items-start gap-1.5">
                        <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-brand-ink/70" aria-hidden="true" />
                        <span>{s.comment}</span>
                      </span>
                    ) : (
                      <span className="text-brand-ink/70">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Detractor (0-6) = atención en amarillo; el resto, neutro. El texto dice cuál es. */
function NpsPill({ score }: { score: number }) {
  const tipo = score >= 9 ? "Promotor" : score <= 6 ? "Detractor" : "Neutro";
  return (
    <ChipEstado atencion={score <= 6} className="min-w-8 justify-center">
      <span aria-hidden="true">{score}</span>
      <span className="sr-only">{`${score}, ${tipo}`}</span>
    </ChipEstado>
  );
}
