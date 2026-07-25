import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Smile, MessageSquare } from "lucide-react";
import { adminApi } from "@/lib/api/endpoints";

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

function AdminSurveys() {
  const [filter, setFilter] = useState<"all" | "detractors" | "promoters">("all");
  const [month, setMonth] = useState("");
  const [orderBy, setOrderBy] = useState<"recent" | "oldest" | "score_desc" | "score_asc">("recent");
  const { data, isLoading } = useQuery({
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
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-brand-ink">Encuestas</h2>
        <p className="mt-1 max-w-2xl text-sm text-brand-ink/65">
          Respuestas de la encuesta NPS que se dispara antes de la última clase
          del periodo o al terminar la mensualidad. Sólo visibles para admin.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="NPS" value={nps} />
        <Kpi label="Respuestas" value={String(totals?.count ?? 0)} />
        <Kpi
          label="Profesor (1-5)"
          value={avg(rows.map((s) => s.teacherScore ?? 0).filter(Boolean))}
        />
        <Kpi
          label="Contenido (1-5)"
          value={avg(rows.map((s) => s.contentScore ?? 0).filter(Boolean))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {([
          ["all", "Todas"],
          ["promoters", "Promotores (9-10)"],
          ["detractors", "Detractores (0-6)"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              filter === key
                ? "border-brand-ink bg-brand-ink text-white"
                : "border-brand-line bg-white text-brand-ink hover:border-brand-ink/40"
            }`}
          >
            {label}
          </button>
        ))}
        {/* Mes: para conocer el NPS de un mes puntual */}
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="ml-2 rounded-full border border-brand-line bg-white px-3 py-1.5 text-xs font-medium text-brand-ink"
        >
          <option value="">Todos los meses</option>
          {(data?.periods ?? []).map((p) => (
            <option key={p} value={p}>{fmtMonth(p)}</option>
          ))}
        </select>
        <select
          value={orderBy}
          onChange={(e) => setOrderBy(e.target.value as typeof orderBy)}
          className="rounded-full border border-brand-line bg-white px-3 py-1.5 text-xs font-medium text-brand-ink"
        >
          <option value="recent">Más recientes</option>
          <option value="oldest">Más antiguas</option>
          <option value="score_desc">Mayor puntaje</option>
          <option value="score_asc">Menor puntaje</option>
        </select>
        {month ? (
          <span className="rounded-full bg-brand-yellow px-3 py-1.5 text-xs font-bold text-brand-ink">
            NPS de {fmtMonth(month)}: {nps}
          </span>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-line bg-white">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-cream/40 text-left text-xs font-semibold uppercase tracking-wide text-brand-ink/60">
            <tr>
              <th className="px-4 py-3">Estudiante</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3 text-center">NPS</th>
              <th className="px-4 py-3 text-center">Profesor</th>
              <th className="px-4 py-3 text-center">Contenido</th>
              <th className="px-4 py-3 text-center">Plataforma</th>
              <th className="px-4 py-3">Comentario</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-brand-ink/55">
                  Cargando encuestas…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-brand-ink/55">
                  <Smile className="mx-auto mb-2 size-5" />
                  Aún no hay respuestas en este filtro.
                </td>
              </tr>
            ) : (
              rows.map((s) => (
                  <tr key={s.id} className="border-t border-brand-line/70 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-brand-ink">{s.user.fullName}</div>
                      <div className="text-xs text-brand-ink/55">{s.user.email}</div>
                    </td>
                    <td className="px-4 py-3 text-brand-ink/65">
                      {new Date(s.createdAt).toLocaleDateString("es-CO", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <NpsPill score={s.score} />
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-xs text-brand-ink/80">
                      {s.teacherScore ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-xs text-brand-ink/80">
                      {s.contentScore ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-xs text-brand-ink/80">
                      {s.platformScore ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-brand-ink/75">
                      {s.comment ? (
                        <span className="inline-flex items-start gap-1.5">
                          <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-brand-ink/50" />
                          <span>{s.comment}</span>
                        </span>
                      ) : (
                        <span className="text-brand-ink/35">—</span>
                      )}
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-brand-line bg-white p-4">
      <div className="text-xs text-brand-ink/55">{label}</div>
      <div className="mt-1 text-2xl font-bold text-brand-ink">{value}</div>
    </div>
  );
}

function NpsPill({ score }: { score: number }) {
  const tone =
    score >= 9
      ? "bg-emerald-100 text-emerald-800"
      : score <= 6
        ? "bg-red-100 text-red-800"
        : "bg-amber-100 text-amber-900";
  return (
    <span className={`inline-flex min-w-8 justify-center rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>
      {score}
    </span>
  );
}