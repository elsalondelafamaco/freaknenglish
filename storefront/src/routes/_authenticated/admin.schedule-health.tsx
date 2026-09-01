import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, RefreshCw, Wrench } from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "@/lib/api/endpoints";

/**
 * Salud del horario: estudiantes con el plan al día cuyo horario no lo está.
 *
 * Existe porque estos desajustes son invisibles desde la ficha del usuario —el
 * plan se ve activo, el profe asignado y todo correcto— y solo salían a la luz
 * cuando un profe reportaba que alguien había desaparecido de su calendario.
 */
export const Route = createFileRoute("/_authenticated/admin/schedule-health")({
  head: () => ({ meta: [{ title: "Salud del horario — Admin Freakn'" }] }),
  component: AdminScheduleHealth,
});

function AdminScheduleHealth() {
  const qc = useQueryClient();
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["admin", "schedule-health"],
    queryFn: () => adminApi.scheduleHealth(),
  });

  const reparar = useMutation({
    mutationFn: (ids?: string[]) => adminApi.repairSchedules(ids),
    onSuccess: (r) => {
      const fallidos = r.resultados.filter((x) => !x.ok);
      if (fallidos.length === 0) {
        toast.success(`${r.reparados} estudiante(s) reparado(s)`);
      } else {
        toast.warning(`${r.reparados} reparado(s), ${fallidos.length} sin resolver: ${fallidos[0].detalle}`);
      }
      setSeleccion(new Set());
      qc.invalidateQueries({ queryKey: ["admin", "schedule-health"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo reparar"),
  });

  const afectados = q.data?.afectados ?? [];
  const reparables = afectados.filter((a) => a.reparable);
  const alternar = (id: string) =>
    setSeleccion((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-ink">Salud del horario</h1>
          <p className="mt-1 max-w-2xl text-brand-ink/70">
            Estudiantes con el plan al día cuyo horario no está sano: franjas retenidas, franjas
            perdidas o semanas sin clases generadas.
          </p>
        </div>
        <button
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          className="inline-flex items-center gap-2 self-start rounded-full border border-brand-line bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-cream/40 disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${q.isFetching ? "animate-spin" : ""}`} /> Revisar
        </button>
      </header>

      {q.isLoading ? (
        <div className="text-sm text-brand-ink/60">Revisando…</div>
      ) : afectados.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-6 text-sm text-green-900">
          <CheckCircle2 className="size-5 shrink-0" />
          <span>
            Todo en orden. Se revisaron {q.data?.revisados ?? 0} estudiantes con plan activo y
            ninguno tiene el horario roto.
          </span>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <span>
                <b>{afectados.length}</b> de {q.data?.revisados} estudiantes con plan activo tienen
                el horario incompleto.
                {afectados.length !== reparables.length ? (
                  <> {afectados.length - reparables.length} necesitan que les asignes un profesor antes.</>
                ) : null}
              </span>
            </div>
            <button
              onClick={() => reparar.mutate(seleccion.size > 0 ? [...seleccion] : undefined)}
              disabled={reparar.isPending || reparables.length === 0}
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:bg-brand-ink/90 disabled:opacity-50"
            >
              <Wrench className="size-4" />
              {reparar.isPending
                ? "Reparando…"
                : seleccion.size > 0
                  ? `Reparar ${seleccion.size} seleccionado(s)`
                  : `Reparar los ${reparables.length}`}
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-brand-line bg-white">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-brand-line text-left text-xs uppercase tracking-wide text-brand-ink/55">
                <tr>
                  <th className="w-10 px-4 py-3"></th>
                  <th className="px-4 py-3">Estudiante</th>
                  <th className="px-4 py-3">Profesor</th>
                  <th className="px-4 py-3">Qué le pasa</th>
                  <th className="px-4 py-3 text-right">Clases futuras</th>
                </tr>
              </thead>
              <tbody>
                {afectados.map((a) => (
                  <tr key={a.id} className="border-b border-brand-line/60 last:border-0">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={seleccion.has(a.id)}
                        onChange={() => alternar(a.id)}
                        disabled={!a.reparable}
                        className="size-4 accent-brand-ink disabled:opacity-40"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-brand-ink">{a.fullName}</div>
                      <div className="text-xs text-brand-ink/55">{a.email}</div>
                    </td>
                    <td className="px-4 py-3 text-brand-ink/75">
                      {a.profesor ?? <span className="text-red-700">Sin asignar</span>}
                    </td>
                    <td className="px-4 py-3">
                      <ul className="flex flex-col gap-1">
                        {a.problemas.map((p) => (
                          <li key={p} className="text-brand-ink/80">
                            · {p}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-brand-ink">
                      {a.clasesFuturas}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-brand-ink/55">
            La reparación devuelve las franjas retenidas, recupera las clases que canceló el sistema
            y genera las que falten hasta el fin de la vigencia. No recupera clases de hoy ni de días
            ya pasados: esas hay que reponerlas a mano.
          </p>
        </>
      )}

      {reparar.data ? (
        <div className="rounded-2xl border border-brand-line bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-ink/60">
            Última reparación
          </h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {reparar.data.resultados.map((r) => (
              <li key={r.id} className={r.ok ? "text-brand-ink/80" : "text-red-700"}>
                {r.ok ? "✓" : "✕"} <b>{r.fullName}</b> — {r.detalle}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
