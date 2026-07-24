import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Save } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api/endpoints";
import { toast } from "sonner";

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
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-brand-ink/60">
            Mes a liquidar
          </label>
          <input
            type="month"
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value)}
            className="mt-1 block rounded-full border border-brand-line bg-white px-4 py-2 text-sm focus:border-brand-ink focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-brand-ink/55">Total a pagar</div>
            <div className="text-2xl font-bold text-brand-ink">
              {formatCop(totalCop)}
            </div>
          </div>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:bg-brand-ink-soft"
          >
            <Download className="size-4" /> Exportar CSV
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-brand-line bg-brand-cream/30 p-4 text-xs text-brand-ink/75">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-brand-ink/55">
              Tarifa por hora (COP)
            </label>
            <input
              type="number"
              min={1}
              step={1000}
              value={rateDraft}
              onChange={(e) => setRateDraft(e.target.value)}
              className="mt-1 w-40 rounded-xl border border-brand-line bg-white px-3 py-2 text-sm focus:border-brand-ink focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => saveRate.mutate()}
            disabled={saveRate.isPending || !rateDraft}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-3 py-2 text-xs font-semibold text-white shadow-soft hover:-translate-y-0.5"
          >
            <Save className="size-3.5" /> Guardar tarifa
          </button>
          <p className="ml-auto text-[11px] text-brand-ink/55">
            Tarifa vigente: <strong>{formatCop(rateCop)}</strong> /h. Solo se cuentan
            clases completadas y validadas por el profesor.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-line bg-white">
        <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-cream/40 text-xs uppercase tracking-wide text-brand-ink/60">
            <tr>
              <th className="px-4 py-3">Profesor</th>
              <th className="px-4 py-3">Clases</th>
              <th className="px-4 py-3">Horas</th>
              <th className="px-4 py-3">Tarifa/h</th>
              <th className="px-4 py-3 text-right">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-line">
            {rowsQ.isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-brand-ink/55">Cargando…</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-brand-ink/55">
                  No hay clases validadas en este mes.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.teacherId}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-brand-ink">{r.fullName}</div>
                    <div className="text-xs text-brand-ink/55">ID: {r.teacherId.slice(0, 8)}</div>
                  </td>
                  <td className="px-4 py-3 text-brand-ink/80">{r.classes}</td>
                  <td className="px-4 py-3 text-brand-ink/80">{r.hours.toFixed(2)} h</td>
                  <td className="px-4 py-3 text-brand-ink/80">{formatCop(r.hourlyRateCop)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-brand-ink">
                    {formatCop(r.amountCop)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr className="bg-brand-cream/30 font-semibold text-brand-ink">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3">
                  {rows.reduce((a, r) => a + r.classes, 0)}
                </td>
                <td className="px-4 py-3">
                  {rows.reduce((a, r) => a + r.hours, 0).toFixed(2)} h
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right">{formatCop(totalCop)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
        </div>
      </div>
    </div>
  );
}