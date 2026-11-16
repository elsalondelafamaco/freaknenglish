import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Snowflake } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/AuthProvider";
import { classesApi, teachersApi } from "@/lib/api/endpoints";
import { claveDia, diaLargo, duracionMin, horaDeClase } from "@/lib/domain/clases-fecha";
import { cn } from "@/lib/utils";
import { Cargando, EstadoError, PageHeader, SeccionTitulo, Vacio, rowLine, tag, tagNeutral } from "@/components/app/AppUi";
import { btnRow, btnRowInk, pillClass } from "@/components/teacher/TeacherUi";

export const Route = createFileRoute("/_authenticated/teacher/schedule")({
  head: () => ({ meta: [{ title: "Agenda — Freakn for Teachers" }] }),
  component: TeacherSchedule,
});

type Filter = "all" | "upcoming" | "past" | "pending" | "frozen";

function TeacherSchedule() {
  const { user } = useAuth();
  const zona = user?.timezone;
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("upcoming");

  const q = useQuery({
    queryKey: ["teacher", "schedule", filter],
    queryFn: () => teachersApi.schedule(filter === "all" ? undefined : filter),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["teacher", "schedule"] });
  const validateM = useMutation({ mutationFn: (id: string) => classesApi.validate(id), onSuccess: () => { toast.success("Asistencia validada"); invalidate(); }, onError: (e: any) => toast.error(e?.message ?? "Error") });
  const noShowM = useMutation({ mutationFn: (id: string) => classesApi.noShow(id), onSuccess: () => { toast.success("Marcado como no asistió"); invalidate(); }, onError: (e: any) => toast.error(e?.message ?? "Error") });
  const freezeM = useMutation({
    mutationFn: (v: { id: string; reason?: string }) => classesApi.freeze(v.id, v.reason),
    onSuccess: () => { toast.success("Clase congelada — no se dará por tomada. Ponle fecha cuando la tengas."); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  const unfreezeM = useMutation({
    mutationFn: (id: string) => classesApi.unfreeze(id),
    onSuccess: () => { toast.success("Clase de vuelta en su horario"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const grouped = useMemo(() => groupByDay((q.data ?? []) as any[], zona), [q.data, zona]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Agenda" highlight="Agenda">
        Tu calendario completo de clases 1-on-1. Valida asistencia desde aquí.
      </PageHeader>

      <div role="group" aria-label="Filtrar clases" className="flex flex-wrap gap-2">
        {(["upcoming", "all", "past", "pending", "frozen"] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={pillClass(filter === f)}>
            {filter === f ? <Check className="size-3.5" aria-hidden="true" /> : null}
            {labelFor(f)}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <Cargando>Cargando tu agenda…</Cargando>
      ) : q.isError ? (
        <EstadoError onRetry={() => void q.refetch()}>No pudimos cargar tu agenda. Revisa tu conexión e inténtalo de nuevo.</EstadoError>
      ) : grouped.length === 0 ? (
        <Vacio titulo="Nada por aquí">No hay clases en este filtro.</Vacio>
      ) : (
        grouped.map(([clave, label, items]) => (
          <section key={clave} aria-labelledby={`dia-${clave}`}>
            <SeccionTitulo id={`dia-${clave}`} className="mb-2 text-[15px]">{label}</SeccionTitulo>
            <ul className="border-2 border-brand-ink bg-white">
              {items.map((c, i) => {
                const nombre = c.student?.fullName ?? `Estudiante #${String(c.studentId).slice(-6)}`;
                const hora = horaDeClase(c.startsAt, zona);
                return (
                  <li
                    key={c.id}
                    className={cn(
                      "flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between",
                      i > 0 ? rowLine : "",
                      c.studentConfirmedAt && !c.teacherValidatedAt ? "bg-brand-yellow-soft" : "",
                    )}
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-[88px] shrink-0 text-center">
                        <div className="text-sm font-extrabold text-brand-ink">{hora}</div>
                        <div className="text-[11px] text-brand-ink/70">{duracionMin(c)} min</div>
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-brand-ink">{nombre}</div>
                        <div className="text-sm text-brand-ink/80">{c.topic ?? "Sesión 1-on-1"}</div>
                        <StatusBadge c={c} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {c.status === "scheduled" || c.studentConfirmedAt ? (
                        <>
                          <button type="button" onClick={() => validateM.mutate(c.id)} disabled={validateM.isPending} aria-label={`Validar clase de ${nombre}, ${hora}`} className={btnRowInk}>Validar</button>
                          <button type="button" onClick={() => noShowM.mutate(c.id)} disabled={noShowM.isPending} aria-label={`Marcar que ${nombre} no asistió, ${hora}`} className={btnRow}>No asistió</button>
                        </>
                      ) : null}
                      {/* Congelar: para cuando hay que mover la clase pero todavía
                          no se sabe para cuándo. Sin esto se auto-validaba al
                          pasar la hora y quedaba cobrada sin haberse dado. */}
                      {c.status === "scheduled" || c.status === "rescheduled" ? (
                        <button
                          type="button"
                          onClick={() => {
                            const motivo = prompt("¿Por qué se reprograma? (opcional)") ?? undefined;
                            freezeM.mutate({ id: c.id, reason: motivo });
                          }}
                          disabled={freezeM.isPending}
                          aria-label={`Congelar clase de ${nombre}, ${hora}`}
                          className={btnRow}
                        >
                          <Snowflake className="size-3.5" aria-hidden="true" /> Congelar
                        </button>
                      ) : null}
                      {c.status === "pending_reschedule" ? (
                        <button
                          type="button"
                          onClick={() => unfreezeM.mutate(c.id)}
                          disabled={unfreezeM.isPending}
                          aria-label={`Devolver a su horario la clase de ${nombre}`}
                          className={btnRow}
                        >
                          Volver a su horario
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function labelFor(f: Filter) {
  if (f === "upcoming") return "Próximas";
  if (f === "all") return "Todas";
  if (f === "past") return "Pasadas";
  if (f === "frozen") return "Por reprogramar";
  return "Pendientes";
}

/** Agrupa por día (en la zona del profe) conservando el orden de la lista: [clave, "lunes 17 de noviembre", clases]. */
function groupByDay(list: any[], zona?: string | null): Array<[string, string, any[]]> {
  const map = new Map<string, [string, any[]]>();
  for (const c of list) {
    const k = claveDia(c.startsAt, zona);
    const e = map.get(k) ?? [diaLargo(c.startsAt, zona), []];
    e[1].push(c);
    map.set(k, e);
  }
  return Array.from(map.entries()).map(([k, [label, items]]) => [k, label, items]);
}

/** Atención (amarillo) solo para lo que pide acción; el resto, neutro. */
function StatusBadge({ c }: { c: any }) {
  const map: Record<string, { label: string; atencion: boolean }> = {
    scheduled: { label: "Programada", atencion: false },
    validated: { label: "Validada", atencion: false },
    no_show: { label: "No asistió", atencion: false },
    pending_reschedule: { label: "Por reprogramar", atencion: true },
    cancelled: { label: "Cancelada", atencion: false },
    rescheduled: { label: "Reprogramada", atencion: true },
  };
  const m = map[c.status] ?? { label: c.status, atencion: false };
  const extra = c.teacherValidatedAt ? " · validada" : c.studentConfirmedAt ? " · pendiente validar" : "";
  return <span className={cn(m.atencion || (c.studentConfirmedAt && !c.teacherValidatedAt) ? tag : tagNeutral, "mt-1")}>{m.label}{extra}</span>;
}
