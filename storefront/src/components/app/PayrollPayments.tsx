import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminApi } from "@/lib/api/endpoints";

const formatCop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

/**
 * Pagos de la nómina: generar las corridas del período, ajustar el valor final
 * de cada profesor y pagarlas (una por una o todo el lote).
 *
 * El pago SIEMPRE queda registrado en la plataforma. La dispersión por Wompi es
 * un paso opcional encima: si está apagada o falla, la corrida igual se marca
 * como pagada en modo manual, con el motivo a la vista.
 */
export function PayrollPayments({ period }: { period: string }) {
  const qc = useQueryClient();
  const [ajustando, setAjustando] = useState<string | null>(null);
  const [montoAjuste, setMontoAjuste] = useState("");
  const [notaAjuste, setNotaAjuste] = useState("");

  const runsQ = useQuery({
    queryKey: ["admin", "payroll", "runs", period],
    queryFn: () => adminApi.payrollRuns(period),
  });
  const runs = runsQ.data ?? [];
  const pendientes = runs.filter((r) => r.status === "pending");
  const totalPendiente = pendientes.reduce((s, r) => s + r.amountCop + (r.adjustmentCop ?? 0), 0);
  const invalidar = () => qc.invalidateQueries({ queryKey: ["admin", "payroll", "runs", period] });

  const generar = useMutation({
    mutationFn: () => adminApi.generatePayroll(period),
    onSuccess: () => { toast.success("Corridas generadas"); invalidar(); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo generar"),
  });
  const pagarUno = useMutation({
    mutationFn: (id: string) => adminApi.payPayrollRun(id),
    onSuccess: (r) => {
      toast.success(
        r.dispersed
          ? `Pagado y dispersado (ref ${r.reference})`
          : `Pagado y registrado como manual${r.error ? ` — ${r.error}` : ""}`,
      );
      invalidar();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo pagar"),
  });
  const pagarLote = useMutation({
    mutationFn: () => adminApi.payAllPayroll(period),
    onSuccess: (r) => {
      toast.success(`${r.pagados} pagadas${r.fallidos ? `, ${r.fallidos} con problema` : ""}`);
      invalidar();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo pagar el lote"),
  });
  const ajustar = useMutation({
    mutationFn: (v: { id: string; monto: number; nota: string }) =>
      adminApi.adjustPayrollRun(v.id, v.monto, v.nota),
    onSuccess: () => {
      toast.success("Ajuste aplicado");
      setAjustando(null); setMontoAjuste(""); setNotaAjuste("");
      invalidar();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo ajustar"),
  });

  return (
    <section className="rounded-3xl border border-brand-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-brand-ink">Pagos del período</h2>
          <p className="mt-0.5 text-xs text-brand-ink/60">
            Genera las corridas, ajusta si hace falta y paga. Cada pago queda registrado aquí
            aunque la dispersión automática esté apagada.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => generar.mutate()}
            disabled={generar.isPending}
            className="rounded-full border border-brand-line px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-cream/40 disabled:opacity-50"
          >
            {generar.isPending ? "Generando…" : "Generar corridas"}
          </button>
          <button
            onClick={() => pagarLote.mutate()}
            disabled={pagarLote.isPending || pendientes.length === 0}
            className="rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:bg-brand-ink-soft disabled:opacity-50"
          >
            {pagarLote.isPending
              ? "Pagando…"
              : `Pagar todo (${pendientes.length}) · ${formatCop(totalPendiente)}`}
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        {runsQ.isLoading ? (
          <p className="text-sm text-brand-ink/55">Cargando…</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-brand-ink/55">
            Sin corridas para {period}. Usa «Generar corridas» para crearlas a partir de las clases
            del mes.
          </p>
        ) : (
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="bg-brand-cream/40 text-xs uppercase tracking-wide text-brand-ink/60">
              <tr>
                <th className="px-4 py-3 text-left">Profesor</th>
                <th className="px-4 py-3 text-left">Clases</th>
                <th className="px-4 py-3 text-right">Calculado</th>
                <th className="px-4 py-3 text-right">Ajuste</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-line/70">
              {runs.map((r) => {
                const total = r.amountCop + (r.adjustmentCop ?? 0);
                const editando = ajustando === r.id;
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-brand-ink">{r.teacher?.fullName ?? r.teacherId}</div>
                      <div className="text-xs text-brand-ink/50">{r.teacher?.email}</div>
                    </td>
                    <td className="px-4 py-3">{r.classes}</td>
                    <td className="px-4 py-3 text-right">{formatCop(r.amountCop)}</td>
                    <td className="px-4 py-3 text-right">
                      {editando ? (
                        <div className="flex flex-col items-end gap-1">
                          <input
                            type="number"
                            value={montoAjuste}
                            onChange={(e) => setMontoAjuste(e.target.value)}
                            placeholder="+50000 / -20000"
                            className="w-32 rounded-lg border border-brand-line px-2 py-1 text-right text-xs"
                          />
                          <input
                            value={notaAjuste}
                            onChange={(e) => setNotaAjuste(e.target.value)}
                            placeholder="Motivo (obligatorio)"
                            className="w-44 rounded-lg border border-brand-line px-2 py-1 text-xs"
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() => ajustar.mutate({ id: r.id, monto: Number(montoAjuste || 0), nota: notaAjuste })}
                              disabled={ajustar.isPending || !notaAjuste.trim()}
                              className="rounded-full bg-brand-ink px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                            >
                              Guardar
                            </button>
                            <button
                              onClick={() => { setAjustando(null); setMontoAjuste(""); setNotaAjuste(""); }}
                              className="rounded-full border border-brand-line px-2.5 py-1 text-[11px]"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span
                            className={
                              r.adjustmentCop
                                ? r.adjustmentCop > 0
                                  ? "text-emerald-700"
                                  : "text-red-600"
                                : "text-brand-ink/40"
                            }
                          >
                            {r.adjustmentCop ? formatCop(r.adjustmentCop) : "—"}
                          </span>
                          {r.adjustmentNote ? (
                            <div className="text-[10px] text-brand-ink/50">{r.adjustmentNote}</div>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-brand-ink">{formatCop(total)}</td>
                    <td className="px-4 py-3">
                      {r.status === "paid" ? (
                        <div>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                            Pagada{r.paidMethod === "wompi" ? " · dispersada" : " · manual"}
                          </span>
                          {r.payoutError ? (
                            <div className="mt-0.5 text-[10px] text-amber-700">{r.payoutError}</div>
                          ) : null}
                          {r.payoutRef ? (
                            <div className="mt-0.5 text-[10px] text-brand-ink/50">ref {r.payoutRef}</div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="rounded-full bg-brand-cream px-2 py-0.5 text-[11px] font-semibold text-brand-ink/70">
                          Pendiente
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.status === "pending" ? (
                        <div className="flex justify-end gap-1.5">
                          {!editando ? (
                            <button
                              onClick={() => {
                                setAjustando(r.id);
                                setMontoAjuste(String(r.adjustmentCop || ""));
                                setNotaAjuste(r.adjustmentNote ?? "");
                              }}
                              className="rounded-full border border-brand-line px-3 py-1.5 text-xs font-semibold text-brand-ink/70 hover:bg-brand-cream/40"
                            >
                              Ajustar
                            </button>
                          ) : null}
                          <button
                            onClick={() => pagarUno.mutate(r.id)}
                            disabled={pagarUno.isPending}
                            className="rounded-full bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-ink-soft disabled:opacity-50"
                          >
                            Pagar
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-brand-ink/40">
                          {r.paidAt ? new Date(r.paidAt).toLocaleDateString("es-CO") : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
