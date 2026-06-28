import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Save } from "lucide-react";
import { computePayroll, formatCop } from "@/lib/domain/admin";
import { getHourlyRate, setHourlyRate } from "@/lib/domain/app-settings";

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
  const [tick, setTick] = useState(0);
  const [rateDraft, setRateDraft] = useState<string>(() => String(getHourlyRate()));
  const payroll = useMemo(() => computePayroll(monthKey), [monthKey, tick]);

  function saveRate() {
    try {
      setHourlyRate(Number(rateDraft));
      setTick((t) => t + 1);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function exportCsv() {
    const header = "teacher_id,teacher_name,email,validated_classes,hours,rate_cop,amount_cop\n";
    const rows = payroll.rows
      .map(
        (r) =>
          `${r.teacher.id},"${r.teacher.fullName}",${r.teacher.email},${r.validatedClasses},${r.hours.toFixed(2)},${r.rateCop},${r.amountCop}`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${monthKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
              {formatCop(payroll.totalCop)}
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
            onClick={saveRate}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-3 py-2 text-xs font-semibold text-white shadow-soft hover:-translate-y-0.5"
          >
            <Save className="size-3.5" /> Guardar tarifa
          </button>
          <p className="ml-auto text-[11px] text-brand-ink/55">
            Tarifa vigente: <strong>{formatCop(payroll.rateCop)}</strong> /h. Solo se cuentan
            clases completadas y validadas por el profesor.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-line bg-white">
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
            {payroll.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-brand-ink/55">
                  No hay profesores registrados.
                </td>
              </tr>
            ) : (
              payroll.rows.map((r) => (
                <tr key={r.teacher.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-brand-ink">{r.teacher.fullName}</div>
                    <div className="text-xs text-brand-ink/55">{r.teacher.email}</div>
                  </td>
                  <td className="px-4 py-3 text-brand-ink/80">{r.validatedClasses}</td>
                  <td className="px-4 py-3 text-brand-ink/80">{r.hours.toFixed(2)} h</td>
                  <td className="px-4 py-3 text-brand-ink/80">{formatCop(r.rateCop)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-brand-ink">
                    {formatCop(r.amountCop)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {payroll.rows.length > 0 ? (
            <tfoot>
              <tr className="bg-brand-cream/30 font-semibold text-brand-ink">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3">
                  {payroll.rows.reduce((a, r) => a + r.validatedClasses, 0)}
                </td>
                <td className="px-4 py-3">
                  {payroll.rows.reduce((a, r) => a + r.hours, 0).toFixed(2)} h
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right">{formatCop(payroll.totalCop)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}