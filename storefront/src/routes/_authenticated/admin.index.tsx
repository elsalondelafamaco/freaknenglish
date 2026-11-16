import { useId, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatCop } from "@/lib/domain/plans";
import { adminApi } from "@/lib/api/endpoints";
import { Cargando, EstadoError, PageHeader, Vacio, tagNeutral } from "@/components/app/AppUi";
import { Seccion, td, th } from "@/components/teacher/TeacherUi";
import { ChipEstado, Kpi, Segmentado } from "@/components/admin/AdminUi";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Analítica — Admin Freakn'" }] }),
  component: AdminAnalytics,
});

const RANGOS = [
  { valor: 30 as const, texto: "30 días" },
  { valor: 90 as const, texto: "90 días" },
  { valor: 365 as const, texto: "1 año" },
];

const diaMes = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

function AdminAnalytics() {
  const [range, setRange] = useState<30 | 90 | 365>(30);
  const q = useQuery({
    queryKey: ["admin", "metrics", range],
    queryFn: () => adminApi.metrics(range),
  });
  const atRiskQ = useQuery({ queryKey: ["admin", "at-risk"], queryFn: () => adminApi.atRisk() });
  const m = q.data;
  const fallidos = ((m as any)?.failedPayments ?? 0) as number;
  const enRiesgo = atRiskQ.data?.length ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrowText="Admin · Analítica"
        title="Cómo va el negocio"
        highlight="negocio"
        aside={<Segmentado etiqueta="Periodo" opciones={RANGOS} valor={range} onChange={setRange} />}
      >
        Cifras en tiempo real. Lo que pide atención aparece en amarillo.
      </PageHeader>

      {q.isLoading ? (
        <Cargando>Cargando métricas…</Cargando>
      ) : q.isError || !m ? (
        <EstadoError onRetry={() => void q.refetch()}>No pudimos cargar las métricas.</EstadoError>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi etiqueta={`Ingresos · ${range} días`} valor={formatCop(m.revenueCop)} ayuda="Pagos aprobados en el periodo." />
            <Kpi
              etiqueta="Lo que entra cada mes"
              valor={formatCop(m.mrrCop)}
              ayuda={`Suma de las suscripciones activas que se renuevan. En un año serían ${formatCop(m.arrCop)}.`}
            />
            <Kpi
              etiqueta="Suscripciones activas"
              valor={m.activeSubscriptions.toString()}
              ayuda={m.congeladas ? `Incluye ${m.congeladas} congelada(s).` : `De ${m.totalStudents} estudiantes.`}
            />
            <Kpi
              etiqueta="Pagos fallidos"
              valor={`${fallidos}`}
              ayuda={fallidos > 0 ? `Últimos ${range} días. Revisa los carritos.` : `Ninguno en los últimos ${range} días.`}
              atencion={fallidos > 0}
              to={fallidos > 0 ? "/admin/carts" : undefined}
            />
            <Kpi etiqueta="Clases validadas" valor={m.classesSeries.reduce((s, c) => s + c.count, 0).toString()} />
            <Kpi etiqueta="Asistencia" valor={`${m.attendanceRate}%`} ayuda="De las clases agendadas, las que sí se dieron." />
            <Kpi etiqueta="Bajas" valor={`${m.churnRate}%`} ayuda="Cancelaciones frente a las activas al inicio del periodo." />
            <Kpi etiqueta="Satisfacción (NPS)" valor={`${m.nps}`} ayuda={`${m.surveys} encuestas respondidas.`} />
          </div>

          <section className="grid gap-6 md:grid-cols-2" aria-label="Series">
            <Seccion id="grafica-ingresos" titulo="Ingresos por día">
              <div className="p-4 pt-0">
                <Grafica
                  fechas={m.revenueSeries.map((r) => r.date)}
                  valores={m.revenueSeries.map((r) => r.cents / 100)}
                  formato={formatCop}
                  descripcion="Ingresos por día"
                />
              </div>
            </Seccion>
            <Seccion id="grafica-clases" titulo="Clases validadas por día" principal={false}>
              <div className="p-4 pt-0">
                <Grafica
                  fechas={m.classesSeries.map((c) => c.date)}
                  valores={m.classesSeries.map((c) => c.count)}
                  formato={(n) => `${n}`}
                  descripcion="Clases validadas por día"
                />
              </div>
            </Seccion>
          </section>

          <Seccion
            id="en-riesgo"
            titulo="Estudiantes en riesgo"
            aside={enRiesgo > 0 ? <ChipEstado atencion>{enRiesgo} en seguimiento</ChipEstado> : <span className="text-xs text-brand-ink/70">0 en seguimiento</span>}
          >
            {atRiskQ.isLoading ? (
              <div className="p-4 pt-0"><Cargando>Cargando estudiantes en riesgo…</Cargando></div>
            ) : atRiskQ.isError ? (
              <div className="p-4 pt-0"><EstadoError onRetry={() => void atRiskQ.refetch()}>No pudimos cargar los estudiantes en riesgo.</EstadoError></div>
            ) : enRiesgo === 0 ? (
              <div className="p-4 pt-0"><Vacio titulo="Todo en orden">Ningún estudiante en riesgo por ahora.</Vacio></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr>
                      <th className={th}>Estudiante</th>
                      <th className={th}>Señales</th>
                      <th className={`${th} text-right`}>Última clase</th>
                      <th className={`${th} text-right`}>Riesgo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(atRiskQ.data ?? []).slice(0, 25).map((r) => (
                      <tr key={r.id} className="align-top">
                        <td className={td}>
                          <div className="font-bold">{r.fullName}</div>
                          <div className="text-xs text-brand-ink/70">{r.email}</div>
                        </td>
                        <td className={td}>
                          <div className="flex flex-wrap gap-1.5">
                            {r.reasons.map((reason, i) => (
                              <ChipEstado key={i} atencion>{reason}</ChipEstado>
                            ))}
                          </div>
                        </td>
                        <td className={`${td} text-right text-xs text-brand-ink/70`}>{r.daysSinceClass != null ? `hace ${r.daysSinceClass} d` : "—"}</td>
                        <td className={`${td} text-right font-bold`}>{r.risk}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Seccion>

          <div className="grid gap-6 md:grid-cols-2">
            <Seccion id="top-profes" titulo="Top profesores" principal={false}>
              {m.topTeachers.length === 0 ? (
                <div className="p-4 pt-0"><Vacio>Sin clases validadas en el periodo.</Vacio></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={th}>Profesor</th>
                        <th className={`${th} text-right`}>Clases</th>
                        <th className={`${th} text-right`}>Horas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.topTeachers.map((t) => (
                        <tr key={t.id}>
                          <td className={td}>{t.fullName}</td>
                          <td className={`${td} text-right font-bold`}>{t.validatedClasses}</td>
                          <td className={`${td} text-right`}>{t.hours}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Seccion>

            <Seccion id="estancados" titulo="Módulos donde se estancan" principal={false}>
              {(((m as any).stuckModules ?? []).length === 0) ? (
                <div className="p-4 pt-0"><Vacio>Sin datos de progreso todavía.</Vacio></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={th}>Módulo</th>
                        <th className={`${th} text-right`}>Estudiantes estancados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {((m as any).stuckModules ?? []).map((sm: any) => (
                        <tr key={sm.moduleId}>
                          <td className={td}>{sm.title}</td>
                          <td className={`${td} text-right font-bold`}>{sm.students}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Seccion>
          </div>

          {m.cohorts.length > 0 ? (
            <Seccion id="cohortes" titulo="Cuántos siguen cada mes" principal={false} aside={<span className="text-xs text-brand-ink/70">Retención por cohorte, en %</span>}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse">
                  <thead>
                    <tr>
                      <th className={th}>Cohorte</th>
                      <th className={`${th} text-right`}>Tamaño</th>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <th key={i} className={`${th} text-right`}>Mes {i}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {m.cohorts.map((c) => (
                      <tr key={c.cohort}>
                        <td className={td}>{c.cohort}</td>
                        <td className={`${td} text-right`}>{c.size}</td>
                        {c.retention.map((r, i) => (
                          <td key={i} className={`${td} text-right font-bold`} style={{ background: `rgba(255,214,0,${Math.min(r, 100) / 220})` }}>{r}%</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Seccion>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * Gráfica de línea con lo mínimo para leerla: máximo, total, y primera y última
 * fecha. Un lector de pantalla recibe un resumen en texto en lugar del dibujo.
 */
function Grafica({
  fechas,
  valores,
  formato,
  descripcion,
}: {
  fechas: string[];
  valores: number[];
  formato: (n: number) => string;
  descripcion: string;
}) {
  const id = useId();
  if (valores.length === 0) return <p className="text-sm text-brand-ink/70">Sin datos en este periodo.</p>;
  const max = Math.max(...valores, 1);
  const total = valores.reduce((s, v) => s + v, 0);
  const iMax = valores.indexOf(Math.max(...valores));
  const w = 600, h = 120;
  const step = valores.length > 1 ? w / (valores.length - 1) : w;
  const puntos = valores.map((v, i) => `${i * step},${h - (v / max) * (h - 6) - 3}`);
  const linea = puntos.join(" ");
  const area = `0,${h} ${linea} ${(valores.length - 1) * step},${h}`;
  return (
    <figure>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-brand-ink/70">
        <span>
          Total <b className="text-brand-ink">{formato(total)}</b>
        </span>
        <span className={tagNeutral}>
          Máx. {formato(valores[iMax])} · {diaMes(fechas[iMax])}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-labelledby={id} className="mt-2 h-32 w-full">
        <title id={id}>{`${descripcion}: total ${formato(total)}, máximo ${formato(valores[iMax])} el ${diaMes(fechas[iMax])}`}</title>
        <polygon points={area} className="fill-brand-yellow/40" />
        <polyline points={linea} fill="none" strokeWidth="2.5" vectorEffect="non-scaling-stroke" className="stroke-brand-ink" />
        <line x1={0} y1={h - 0.5} x2={w} y2={h - 0.5} strokeWidth="1" vectorEffect="non-scaling-stroke" className="stroke-brand-ink/40" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] font-semibold text-brand-ink/70">
        <span>{diaMes(fechas[0])}</span>
        <span>{diaMes(fechas[fechas.length - 1])}</span>
      </figcaption>
    </figure>
  );
}
