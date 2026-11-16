import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, RefreshCw, Wrench } from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "@/lib/api/endpoints";
import { Cargando, EstadoError, PageHeader, btnChip, btnChipInk, focusRing } from "@/components/app/AppUi";
import { td, th } from "@/components/teacher/TeacherUi";

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
      const liberadas = r.franjasLiberadas
        ? `${r.franjasLiberadas} franja(s) liberada(s)`
        : "";
      if (fallidos.length === 0) {
        const arreglados = r.reparados ? `${r.reparados} estudiante(s) reparado(s)` : "";
        toast.success([liberadas, arreglados].filter(Boolean).join(" · ") || "Nada que reparar");
      } else {
        toast.warning(`${r.reparados} reparado(s), ${fallidos.length} sin resolver: ${fallidos[0].detalle}`);
      }
      setSeleccion(new Set());
      qc.invalidateQueries({ queryKey: ["admin", "schedule-health"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo reparar"),
  });

  const afectados = q.data?.afectados ?? [];
  const fantasmas = q.data?.franjasFantasma ?? [];
  const cruces = q.data?.cruces ?? [];
  const reparables = afectados.filter((a) => a.reparable);
  const alternar = (id: string) =>
    setSeleccion((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrowText="Admin · Operación"
        title="Salud del horario"
        highlight="horario"
        aside={
          <button type="button" onClick={() => q.refetch()} disabled={q.isFetching} className={btnChip}>
            <RefreshCw className={`size-4 ${q.isFetching ? "animate-spin" : ""}`} aria-hidden="true" /> Revisar de nuevo
          </button>
        }
      >
        Estudiantes con el plan al día cuyo horario no está sano: franjas retenidas, franjas perdidas o semanas sin
        clases generadas.
      </PageHeader>

      {/* Franjas que reservan la hora de un profe sin nadie detrás. Van aparte
          porque el problema no es del alumno —ya no está— sino del profesor,
          que no puede recibir a nadie a esa hora hasta soltarlas. */}
      {fantasmas.length > 0 ? (
        <div className="border-2 border-brand-ink bg-brand-yellow-soft p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-brand-ink">
              <b>{fantasmas.length}</b> franja(s) siguen ocupando la hora de un profesor sin nadie
              detrás. Mientras existan, no puedes asignar a nadie más a esa hora.
            </p>
            <button
              type="button"
              onClick={() => reparar.mutate(undefined)}
              disabled={reparar.isPending}
              className={`${btnChipInk} shrink-0`}
            >
              {reparar.isPending ? "Liberando…" : "Liberar franjas"}
            </button>
          </div>
          <ul className="mt-3 flex flex-col gap-1 text-sm text-brand-ink">
            {fantasmas.map((f) => (
              <li key={f.id}>
                · <b>{f.profesor}</b>, {f.cuando} — la reserva {f.alumno} ({f.motivo})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Dos alumnos en la misma hora del mismo profe. No hay botón: resolverlo
          implica mover a alguien y esa decisión no la puede tomar el sistema.
          Se listan porque la base no los detecta —su único índice cubre solo la
          hora de inicio— y hasta ahora solo aparecían cuando dos personas se
          presentaban a la misma clase. */}
      {cruces.length > 0 ? (
        <div className="border-2 border-brand-ink bg-brand-yellow-soft p-4">
          <p className="text-sm text-brand-ink">
            <b>{cruces.length}</b> hora(s) con dos estudiantes a la vez. Hay que mover a uno de
            los dos desde su ficha; el sistema no puede decidir a cuál.
          </p>
          <ul className="mt-3 flex flex-col gap-1 text-sm text-brand-ink">
            {cruces.map((c, i) => (
              <li key={i}>
                · <b>{c.profesor}</b>, {c.cuando} — {c.alumnos.join(" y ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {q.isLoading ? (
        <Cargando>Revisando horarios…</Cargando>
      ) : q.isError ? (
        <EstadoError onRetry={() => void q.refetch()}>No pudimos revisar los horarios.</EstadoError>
      ) : afectados.length === 0 ? (
        <div className="shadow-hard flex items-center gap-3 border-2 border-brand-ink bg-white p-6 text-sm font-semibold text-brand-ink">
          <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
          <span>
            Todo en orden. Se revisaron {q.data?.revisados ?? 0} estudiantes con plan activo y
            ninguno tiene el horario roto.
          </span>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 border-2 border-brand-ink bg-brand-yellow-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 text-sm text-brand-ink">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <span>
                <b>{afectados.length}</b> de {q.data?.revisados} estudiantes con plan activo tienen
                el horario incompleto.
                {afectados.length !== reparables.length ? (
                  <> {afectados.length - reparables.length} necesitan que les asignes un profesor antes.</>
                ) : null}
              </span>
            </div>
            <button
              type="button"
              onClick={() => reparar.mutate(seleccion.size > 0 ? [...seleccion] : undefined)}
              disabled={reparar.isPending || reparables.length === 0}
              className={`${btnChipInk} shrink-0`}
            >
              <Wrench className="size-4" aria-hidden="true" />
              {reparar.isPending
                ? "Reparando…"
                : seleccion.size > 0
                  ? `Reparar ${seleccion.size} seleccionado(s)`
                  : `Reparar los ${reparables.length}`}
            </button>
          </div>

          <div className="overflow-x-auto bg-white border-2 border-brand-ink">
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr>
                  <th className={`${th} w-12`}><span className="sr-only">Elegir</span></th>
                  <th className={th}>Estudiante</th>
                  <th className={th}>Profesor</th>
                  <th className={th}>Qué le pasa</th>
                  <th className={`${th} text-right`}>Clases futuras</th>
                </tr>
              </thead>
              <tbody>
                {afectados.map((a) => (
                  <tr key={a.id}>
                    <td className={td}>
                      <input
                        type="checkbox"
                        aria-label={`Elegir a ${a.fullName}`}
                        checked={seleccion.has(a.id)}
                        onChange={() => alternar(a.id)}
                        disabled={!a.reparable}
                        className={`size-5 accent-brand-ink disabled:opacity-40 ${focusRing}`}
                      />
                    </td>
                    <td className={td}>
                      <div className="font-bold text-brand-ink">{a.fullName}</div>
                      <div className="text-xs text-brand-ink/70">{a.email}</div>
                    </td>
                    <td className={td}>
                      {a.profesor ?? <span className="font-bold">Sin asignar</span>}
                    </td>
                    <td className={td}>
                      <ul className="flex flex-col gap-1">
                        {a.problemas.map((p) => (
                          <li key={p}>
                            · {p}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className={`${td} text-right font-bold`}>
                      {a.clasesFuturas}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-brand-ink/70">
            La reparación devuelve las franjas retenidas, recupera las clases que canceló el sistema
            y genera las que falten hasta el fin de la vigencia. No recupera clases de hoy ni de días
            ya pasados: esas hay que reponerlas a mano.
          </p>
        </>
      )}

      {reparar.data ? (
        <div className="border-2 border-brand-ink bg-white p-4">
          <h2 className="font-display text-[18px] font-extrabold uppercase leading-tight text-brand-ink">
            Última reparación
          </h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {reparar.data.resultados.map((r) => (
              <li key={r.id} className={r.ok ? "text-brand-ink" : "font-semibold text-red-800"}>
                <b>{r.ok ? "Reparado:" : "Sin resolver:"} {r.fullName}</b> — {r.detalle}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
