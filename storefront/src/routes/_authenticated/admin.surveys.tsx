import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Smile, MessageSquare } from "lucide-react";
import { listAllSurveys } from "@/lib/domain/survey";
import { readDb } from "@/lib/domain/repository";
import type { User } from "@/lib/domain/types";

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
  const surveys = useMemo(() => listAllSurveys(), []);
  const usersById = useMemo(() => {
    const all = (readDb().users ?? {}) as Record<string, User>;
    return all;
  }, []);
  const [filter, setFilter] = useState<"all" | "detractors" | "promoters">("all");

  const filtered = surveys.filter((s) => {
    if (filter === "detractors") return s.nps <= 6;
    if (filter === "promoters") return s.nps >= 9;
    return true;
  });

  const promoters = surveys.filter((s) => s.nps >= 9).length;
  const detractors = surveys.filter((s) => s.nps <= 6).length;
  const nps =
    surveys.length === 0
      ? "—"
      : `${Math.round(((promoters - detractors) / surveys.length) * 100)}`;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-brand-ink">Encuestas</h2>
        <p className="mt-1 max-w-2xl text-sm text-brand-ink/65">
          Respuestas de los estudiantes a la encuesta de calidad cada 30 días. Las
          respuestas son privadas: los profesores no las pueden ver.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="NPS" value={nps} />
        <Kpi label="Respuestas" value={String(surveys.length)} />
        <Kpi label="Profesor (1-5)" value={avg(surveys.map((s) => s.teacherScore ?? 0).filter(Boolean))} />
        <Kpi label="Contenido (1-5)" value={avg(surveys.map((s) => s.contentScore ?? 0).filter(Boolean))} />
      </div>

      <div className="flex flex-wrap gap-1.5">
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
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-line bg-white">
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-brand-ink/55">
                  <Smile className="mx-auto mb-2 size-5" />
                  Aún no hay respuestas en este filtro.
                </td>
              </tr>
            ) : (
              filtered.map((s) => {
                const u = usersById[s.userId];
                return (
                  <tr key={s.id} className="border-t border-brand-line/70 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-brand-ink">{u?.fullName ?? "—"}</div>
                      <div className="text-xs text-brand-ink/55">{u?.email ?? s.userId}</div>
                    </td>
                    <td className="px-4 py-3 text-brand-ink/65">
                      {new Date(s.submittedAt).toLocaleDateString("es-CO", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <NpsPill score={s.nps} />
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
                );
              })
            )}
          </tbody>
        </table>
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