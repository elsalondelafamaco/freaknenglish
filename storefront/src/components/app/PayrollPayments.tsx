import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Cargando, EstadoError, SeccionTitulo, Vacio, btnChip, btnChipInk } from "@/components/app/AppUi";
import { btnRow, btnRowInk, inputBase, td, th } from "@/components/teacher/TeacherUi";
import { ChipEstado } from "@/components/admin/AdminUi";
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
    <section aria-labelledby="pagos-periodo" className="shadow-hard border-2 border-brand-ink bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SeccionTitulo id="pagos-periodo">Pagos del período</SeccionTitulo>
          <p className="mt-0.5 text-xs text-brand-ink/70">
            Genera las corridas, ajusta si hace falta y paga. Cada pago queda registrado aquí
            aunque la dispersión automática esté apagada.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => generar.mutate()}
            disabled={generar.isPending}
            className={btnChip}
          >
            {generar.isPending ? "Generando…" : "Generar corridas"}
          </button>
          <button
            type="button"
            onClick={() => pagarLote.mutate()}
            disabled={pagarLote.isPending || pendientes.length === 0}
            className={btnChipInk}
          >
            {pagarLote.isPending
              ? "Pagando…"
              : `Pagar todo (${pendientes.length}) · ${formatCop(totalPendiente)}`}
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        {runsQ.isError ? (
          <EstadoError onRetry={() => void runsQ.refetch()}>No pudimos cargar los pagos del período.</EstadoError>
        ) : runsQ.isLoading ? (
          <Cargando>Cargando pagos…</Cargando>
        ) : runs.length === 0 ? (
          <Vacio titulo="Sin corridas">
            Sin corridas para {period}. Usa «Generar corridas» para crearlas a partir de las clases del mes.
          </Vacio>
        ) : (
          <table className="w-full min-w-[46rem] border-collapse">
            <thead>
              <tr>
                <th className={`${th} text-left`}>Profesor</th>
                <th className={`${th} text-left`}>Clases</th>
                <th className={`${th} text-right`}>Calculado</th>
                <th className={`${th} text-right`}>Ajuste</th>
                <th className={`${th} text-right`}>Total</th>
                <th className={`${th} text-left`}>Estado</th>
                <th className={`${th} text-right`}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const total = r.amountCop + (r.adjustmentCop ?? 0);
                const editando = ajustando === r.id;
                return (
                  <tr key={r.id}>
                    <td className={td}>
                      <div className="font-bold text-brand-ink">{r.teacher?.fullName ?? r.teacherId}</div>
                      <div className="text-xs text-brand-ink/70">{r.teacher?.email}</div>
                    </td>
                    <td className={td}>{r.classes}</td>
                    <td className={`${td} text-right`}>{formatCop(r.amountCop)}</td>
                    <td className={`${td} text-right`}>
                      {editando ? (
                        <div className="flex flex-col items-end gap-1">
                          <input
                            type="number"
                            value={montoAjuste}
                            onChange={(e) => setMontoAjuste(e.target.value)}
                            placeholder="+50000 / -20000"
                            aria-label={`Monto del ajuste de ${r.teacher?.fullName ?? r.teacherId}`}
                            className={`${inputBase} w-36 text-right`}
                          />
                          <input
                            value={notaAjuste}
                            onChange={(e) => setNotaAjuste(e.target.value)}
                            placeholder="Motivo (obligatorio)"
                            aria-label={`Motivo del ajuste de ${r.teacher?.fullName ?? r.teacherId}`}
                            className={`${inputBase} w-48`}
                          />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => ajustar.mutate({ id: r.id, monto: Number(montoAjuste || 0), nota: notaAjuste })}
                              disabled={ajustar.isPending || !notaAjuste.trim()}
                              className={btnRowInk}
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={() => { setAjustando(null); setMontoAjuste(""); setNotaAjuste(""); }}
                              className={btnRow}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span
                            className={r.adjustmentCop ? "font-bold text-brand-ink" : "text-brand-ink/70"}
                          >
                            {r.adjustmentCop ? formatCop(r.adjustmentCop) : "—"}
                          </span>
                          {r.adjustmentNote ? (
                            <div className="text-xs text-brand-ink/70">{r.adjustmentNote}</div>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className={`${td} text-right font-bold`}>{formatCop(total)}</td>
                    <td className={td}>
                      {r.status === "paid" ? (
                        <div>
                          <ChipEstado>Pagada{r.paidMethod === "wompi" ? " · dispersada" : " · manual"}</ChipEstado>
                          {r.payoutError ? (
                            <div className="mt-0.5 text-xs font-bold text-brand-ink">{r.payoutError}</div>
                          ) : null}
                          {r.payoutRef ? (
                            <div className="mt-0.5 text-xs text-brand-ink/70">ref {r.payoutRef}</div>
                          ) : null}
                        </div>
                      ) : (
                        <ChipEstado atencion>Pendiente</ChipEstado>
                      )}
                    </td>
                    <td className={`${td} text-right`}>
                      {r.status === "pending" ? (
                        <div className="flex justify-end gap-1.5">
                          {!editando ? (
                            <button
                              type="button"
                              onClick={() => {
                                setAjustando(r.id);
                                setMontoAjuste(String(r.adjustmentCop || ""));
                                setNotaAjuste(r.adjustmentNote ?? "");
                              }}
                              aria-label={`Ajustar el pago de ${r.teacher?.fullName ?? r.teacherId}`}
                              className={btnRow}
                            >
                              Ajustar
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => pagarUno.mutate(r.id)}
                            disabled={pagarUno.isPending}
                            aria-label={`Pagar a ${r.teacher?.fullName ?? r.teacherId}`}
                            className={btnRowInk}
                          >
                            Pagar
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-brand-ink/60">
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
