import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  CreditCard,
  GraduationCap,
  Smile,
  TrendingUp,
  Users,
  TrendingDown,
  DollarSign,
} from "lucide-react";
import { formatCop } from "@/lib/domain/plans";
import { adminApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Analítica — Admin Freakn'" }] }),
  component: AdminAnalytics,
});

function AdminAnalytics() {
  const [range, setRange] = useState<30 | 90 | 365>(30);
  const q = useQuery({
    queryKey: ["admin", "metrics", range],
    queryFn: () => adminApi.metrics(range),
  });
  const atRiskQ = useQuery({ queryKey: ["admin", "at-risk"], queryFn: () => adminApi.atRisk() });
  const m = q.data;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-ink">Analítica</h1>
          <p className="text-sm text-brand-ink/60">KPIs y series en tiempo real desde el backend.</p>
        </div>
        <div className="inline-flex rounded-full border border-brand-line bg-white p-1">
          {[
            { v: 30, l: "30d" },
            { v: 90, l: "90d" },
            { v: 365, l: "1a" },
          ].map((o) => (
            <button
              key={o.v}
              onClick={() => setRange(o.v as 30 | 90 | 365)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                range === o.v ? "bg-brand-ink text-white" : "text-brand-ink/70"
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
      </header>

      {q.isLoading || !m ? (
        <div className="text-sm text-brand-ink/60">Cargando métricas…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card icon={<Users className="size-4" />} label="Estudiantes" value={m.totalStudents.toString()} />
            <Card icon={<CreditCard className="size-4" />} label="Suscripciones activas" value={m.activeSubscriptions.toString()} highlight />
            <Card icon={<TrendingUp className="size-4" />} label="MRR" value={formatCop(m.mrrCop)} sub={`ARR ${formatCop(m.arrCop)}`} />
            <Card icon={<DollarSign className="size-4" />} label={`Ingresos ${range}d`} value={formatCop(m.revenueCop)} sub={`${m.revenueSeries.length} días`} />
            <Card icon={<GraduationCap className="size-4" />} label="Clases validadas" value={m.classesSeries.reduce((s, c) => s + c.count, 0).toString()} />
            <Card icon={<CheckCircle2 className="size-4" />} label="Asistencia" value={`${m.attendanceRate}%`} />
            <Card icon={<TrendingDown className="size-4" />} label="Churn" value={`${m.churnRate}%`} sub="Cancelaciones vs. activas al inicio" />
            <Card icon={<Smile className="size-4" />} label="NPS" value={`${m.nps}`} sub={`${m.surveys} encuestas`} />
            <Card icon={<CreditCard className="size-4" />} label="Pagos fallidos" value={`${(m as any).failedPayments ?? 0}`} highlight={((m as any).failedPayments ?? 0) > 0} sub={`últimos ${range}d`} />
          </div>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-brand-line bg-white p-5">
              <div className="mb-3 text-sm font-semibold text-brand-ink">Ingresos por día</div>
              <Sparkline values={m.revenueSeries.map((r) => r.cents)} />
            </div>
            <div className="rounded-2xl border border-brand-line bg-white p-5">
              <div className="mb-3 text-sm font-semibold text-brand-ink">Clases validadas por día</div>
              <Sparkline values={m.classesSeries.map((c) => c.count)} />
            </div>
          </section>

          <section className="rounded-2xl border border-brand-line bg-white p-5">
            <div className="mb-3 text-sm font-semibold text-brand-ink">Top profesores</div>
            {m.topTeachers.length === 0 ? (
              <div className="text-sm text-brand-ink/60">Sin clases validadas en el rango.</div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-brand-ink/50">
                  <tr><th className="py-2 text-left">Profesor</th><th className="text-right">Clases</th><th className="text-right">Horas</th></tr>
                </thead>
                <tbody>
                  {m.topTeachers.map((t) => (
                    <tr key={t.id} className="border-t border-brand-line">
                      <td className="py-2">{t.fullName}</td>
                      <td className="text-right font-semibold">{t.validatedClasses}</td>
                      <td className="text-right">{t.hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-brand-line bg-white p-5">
            <div className="mb-3 text-sm font-semibold text-brand-ink">Módulos donde se estancan los estudiantes</div>
            {(((m as any).stuckModules ?? []).length === 0) ? (
              <div className="text-sm text-brand-ink/60">Sin datos de progreso todavía.</div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-brand-ink/50">
                  <tr><th className="py-2 text-left">Módulo</th><th className="text-right">Estudiantes estancados</th></tr>
                </thead>
                <tbody>
                  {((m as any).stuckModules ?? []).map((sm: any) => (
                    <tr key={sm.moduleId} className="border-t border-brand-line">
                      <td className="py-2">{sm.title}</td>
                      <td className="text-right font-semibold">{sm.students}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-brand-line bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-brand-ink">Estudiantes en riesgo</div>
              <span className="text-xs text-brand-ink/55">{atRiskQ.data?.length ?? 0} en seguimiento</span>
            </div>
            {atRiskQ.isLoading ? (
              <div className="text-sm text-brand-ink/60">Cargando…</div>
            ) : (atRiskQ.data?.length ?? 0) === 0 ? (
              <div className="text-sm text-brand-ink/60">Ningún estudiante en riesgo. 🎉</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-brand-ink/50">
                    <tr><th className="py-2 text-left">Estudiante</th><th className="text-left">Señales</th><th className="text-right">Última clase</th><th className="text-right">Riesgo</th></tr>
                  </thead>
                  <tbody>
                    {(atRiskQ.data ?? []).slice(0, 25).map((r) => (
                      <tr key={r.id} className="border-t border-brand-line align-top">
                        <td className="py-2">
                          <div className="font-semibold text-brand-ink">{r.fullName}</div>
                          <div className="text-xs text-brand-ink/50">{r.email}</div>
                        </td>
                        <td className="py-2">
                          <div className="flex flex-wrap gap-1">
                            {r.reasons.map((reason, i) => (
                              <span key={i} className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">{reason}</span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 text-right text-xs text-brand-ink/60">{r.daysSinceClass != null ? `hace ${r.daysSinceClass}d` : "—"}</td>
                        <td className="py-2 text-right font-semibold text-brand-ink">{r.risk}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {m.cohorts.length > 0 ? (
            <section className="rounded-2xl border border-brand-line bg-white p-5 overflow-x-auto">
              <div className="mb-3 text-sm font-semibold text-brand-ink">Retención por cohorte (%)</div>
              <table className="w-full text-xs">
                <thead className="text-brand-ink/50">
                  <tr><th className="py-1 text-left">Cohorte</th><th className="text-right">Tamaño</th>
                    {Array.from({ length: 6 }).map((_, i) => <th key={i} className="text-right">M{i}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {m.cohorts.map((c) => (
                    <tr key={c.cohort} className="border-t border-brand-line">
                      <td className="py-1.5">{c.cohort}</td>
                      <td className="text-right">{c.size}</td>
                      {c.retention.map((r, i) => (
                        <td key={i} className="text-right" style={{ background: `rgba(10,10,10,${r / 400})` }}>{r}%</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) return <div className="text-xs text-brand-ink/50">Sin datos</div>;
  const max = Math.max(...values, 1);
  const w = 600, h = 60;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const points = values.map((v, i) => `${i * step},${h - (v / max) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-16">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-ink" />
    </svg>
  );
}

function Card({
  icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        highlight ? "border-brand-ink bg-brand-cream/30" : "border-brand-line bg-white"
      }`}
    >
      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-ink/60">
        {icon} {label}
      </div>
      <div className="mt-2 text-3xl font-bold tracking-tight text-brand-ink">{value}</div>
      {sub ? <div className="mt-1 text-xs text-brand-ink/55">{sub}</div> : null}
    </div>
  );
}