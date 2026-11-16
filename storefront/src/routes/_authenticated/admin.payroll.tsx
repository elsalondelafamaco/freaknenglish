import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Download, Save } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api/endpoints";
import { PayrollPayments } from "@/components/app/PayrollPayments";
import { toast } from "sonner";
import { Cargando, EstadoError, PageHeader, Vacio, btnChipInk } from "@/components/app/AppUi";
import { btnRowInk, inputBase, td, th } from "@/components/teacher/TeacherUi";

const formatCop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

export const Route = createFileRoute("/_authenticated/admin/payroll")({
  head: () => ({ meta: [{ title: "Nómina — Admin Freakn'" }] }),
  component: AdminPayroll,
});

function currentMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function AdminPayroll() {
  const [monthKey, setMonthKey] = useState(currentMonth());
  const qc = useQueryClient();
  const rowsQ = useQuery({
    queryKey: ["admin", "payroll", monthKey],
    queryFn: () => adminApi.payroll(monthKey),
  });
  const settingsQ = useQuery({
    queryKey: ["admin", "payroll", "settings"],
    queryFn: () => adminApi.payrollSettings(),
  });
  const [rateDraft, setRateDraft] = useState<string>("");
  useEffect(() => {
    if (settingsQ.data) setRateDraft(String(settingsQ.data.hourlyRateCop));
  }, [settingsQ.data]);

  const saveRate = useMutation({
    mutationFn: () => adminApi.setPayrollSettings(Number(rateDraft)),
    onSuccess: () => {
      toast.success("Tarifa actualizada");
      qc.invalidateQueries({ queryKey: ["admin", "payroll"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error al guardar"),
  });

  const rows = rowsQ.data ?? [];
  const rateCop = settingsQ.data?.hourlyRateCop ?? 0;
  const totalCop = useMemo(() => rows.reduce((a, r) => a + r.amountCop, 0), [rows]);

  async function exportCsv() {
    try {
      const csv = await adminApi.payrollCsv(monthKey);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payroll-${monthKey}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.message ?? "Error al exportar");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrowText="Admin · Personas" title="Nómina de profesores" highlight="Nómina">
        Lo que se le paga a cada profesor por las clases completadas y validadas del mes.
      </PageHeader>

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <label htmlFor="mes-liquidar" className="block text-xs font-bold text-brand-ink">
            Mes a liquidar
          </label>
          <input
            id="mes-liquidar"
            type="month"
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value)}
            className={`${inputBase} mt-1 w-auto`}
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-ink/70">Total a pagar</div>
            <div className="font-display text-[30px] font-extrabold leading-none text-brand-ink">
              {formatCop(totalCop)}
            </div>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className={btnChipInk}
          >
            <Download className="size-4" aria-hidden="true" /> Exportar CSV
          </button>
        </div>
      </div>

      <div className="border-2 border-brand-ink bg-white p-4 text-xs text-brand-ink/80">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="tarifa-clase" className="block text-xs font-bold text-brand-ink">
              Tarifa por clase de 50 min (COP)
            </label>
            <input
              id="tarifa-clase"
              type="number"
              min={1}
              step={1000}
              value={rateDraft}
              onChange={(e) => setRateDraft(e.target.value)}
              className={`${inputBase} mt-1 w-40`}
            />
          </div>
          <button
            type="button"
            onClick={() => saveRate.mutate()}
            disabled={saveRate.isPending || !rateDraft}
            className={btnRowInk}
          >
            <Save className="size-3.5" /> Guardar tarifa
          </button>
          <p className="ml-auto text-[11px] text-brand-ink/70">
            Tarifa vigente: <strong>{formatCop(rateCop)}</strong> por bloque de 50 min,
            proporcional a la duración real (una clase de 75 min paga 1.5×). Solo se
            cuentan clases completadas y validadas.
          </p>
        </div>
      </div>

      {rowsQ.isError ? (
        <EstadoError onRetry={() => void rowsQ.refetch()}>No pudimos cargar la nómina de este mes.</EstadoError>
      ) : rowsQ.isLoading ? (
        <Cargando>Cargando nómina…</Cargando>
      ) : rows.length === 0 ? (
        <Vacio titulo="Sin clases este mes">No hay clases validadas en este mes.</Vacio>
      ) : (
      <div className="shadow-hard overflow-hidden border-2 border-brand-ink bg-white">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr>
              <th className={th}>Profesor</th>
              <th className={th}>Clases</th>
              <th className={th}>Horas</th>
              <th className={th}>Tarifa/clase</th>
              <th className={`${th} text-right`}>Monto</th>
            </tr>
          </thead>
          <tbody>
            {(
              rows.map((r) => (
                <tr key={r.teacherId}>
                  <td className={td}>
                    <div className="font-bold text-brand-ink">{r.fullName}</div>
                    <div className="text-xs text-brand-ink/70">ID: {r.teacherId.slice(0, 8)}</div>
                    {/* Dos clases pagables a la misma hora: pasa cuando el profe
                        usa la hora de quien no entró para reponer con otro. Se
                        paga igual, pero conviene mirarlo antes de aprobar. */}
                    {r.clasesCruzadas ? (
                      <div
                        title="El profesor tiene clases que se pisan en el tiempo. Se están pagando las dos."
                        className="mt-1 inline-flex items-center gap-1 rounded-full border-[1.5px] border-brand-ink bg-brand-yellow-soft px-2.5 py-0.5 text-[11px] font-bold text-brand-ink"
                      >
                        <AlertTriangle className="size-3" aria-hidden="true" /> {r.clasesCruzadas} hora{r.clasesCruzadas === 1 ? "" : "s"} cruzada
                        {r.clasesCruzadas === 1 ? "" : "s"}
                      </div>
                    ) : null}
                  </td>
                  <td className={td}>{r.classes}</td>
                  <td className={td}>{r.hours.toFixed(2)} h</td>
                  <td className={td}>{formatCop(r.hourlyRateCop)}</td>
                  <td className={`${td} text-right font-bold`}>
                    {formatCop(r.amountCop)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr className="bg-brand-cream-soft font-bold text-brand-ink">
                <td className={td}>Total</td>
                <td className={td}>
                  {rows.reduce((a, r) => a + r.classes, 0)}
                </td>
                <td className={td}>
                  {rows.reduce((a, r) => a + r.hours, 0).toFixed(2)} h
                </td>
                <td className={td} />
                <td className={`${td} text-right`}>{formatCop(totalCop)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
        </div>
      </div>
      )}

      <PayrollPayments period={monthKey} />
    </div>
  );
}