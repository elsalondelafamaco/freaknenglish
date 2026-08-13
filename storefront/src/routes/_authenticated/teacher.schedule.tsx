import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Snowflake } from "lucide-react";
import { toast } from "sonner";
import { classesApi, teachersApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/teacher/schedule")({
  head: () => ({ meta: [{ title: "Agenda — Freakn for Teachers" }] }),
  component: TeacherSchedule,
});

const dateFmt = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "2-digit", month: "long" });
const timeFmt = new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" });
const durMin = (c: any) => Math.max(0, Math.round((new Date(c.endsAt).getTime() - new Date(c.startsAt).getTime()) / 60000)) || 50;

type Filter = "all" | "upcoming" | "past" | "pending" | "frozen";

function TeacherSchedule() {
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

  const grouped = useMemo(() => groupByDay((q.data ?? []) as any[]), [q.data]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-ink">Agenda</h1>
          <p className="mt-1 text-brand-ink/70">Tu calendario completo de clases 1-on-1. Valida asistencia desde aquí.</p>
        </div>
        <div className="inline-flex rounded-full border border-brand-line bg-white p-1 text-xs">
          {(["upcoming", "all", "past", "pending", "frozen"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1.5 font-medium transition ${filter === f ? "bg-brand-ink text-white" : "text-brand-ink/70 hover:text-brand-ink"}`}>
              {labelFor(f)}
            </button>
          ))}
        </div>
      </header>

      {q.isLoading ? (
        <div className="text-sm text-brand-ink/60">Cargando…</div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-line bg-white p-8 text-center text-sm text-brand-ink/65">No hay clases en este filtro.</div>
      ) : (
        grouped.map(([day, items]) => (
          <section key={day}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-ink/60">{day}</h2>
            <div className="mt-2 flex flex-col gap-2">
              {items.map((c) => (
                <div key={c.id} className="flex flex-col gap-3 rounded-2xl border border-brand-line bg-white p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="rounded-xl bg-brand-cream px-3 py-2 text-center">
                      <div className="text-xs uppercase text-brand-ink/55">{timeFmt.format(new Date(c.startsAt))}</div>
                      <div className="text-[10px] text-brand-ink/50">{durMin(c)}min</div>
                    </div>
                    <div>
                      <div className="font-semibold text-brand-ink">{c.student?.fullName ?? `Estudiante #${String(c.studentId).slice(-6)}`}</div>
                      <div className="text-sm text-brand-ink/65">{c.topic ?? "Sesión 1-on-1"}</div>
                      <StatusBadge c={c} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {c.status === "scheduled" || c.studentConfirmedAt ? (
                      <>
                        <button onClick={() => validateM.mutate(c.id)} disabled={validateM.isPending} className="rounded-full border border-brand-line bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40 disabled:opacity-50">Validar</button>
                        <button onClick={() => noShowM.mutate(c.id)} disabled={noShowM.isPending} className="rounded-full border border-brand-line bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">No asistió</button>
                      </>
                    ) : null}
                    {/* Congelar: para cuando hay que mover la clase pero todavía
                        no se sabe para cuándo. Sin esto se auto-validaba al
                        pasar la hora y quedaba cobrada sin haberse dado. */}
                    {c.status === "scheduled" || c.status === "rescheduled" ? (
                      <button
                        onClick={() => {
                          const motivo = prompt("¿Por qué se reprograma? (opcional)") ?? undefined;
                          freezeM.mutate({ id: c.id, reason: motivo });
                        }}
                        disabled={freezeM.isPending}
                        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        <Snowflake className="size-3.5" /> Congelar
                      </button>
                    ) : null}
                    {c.status === "pending_reschedule" ? (
                      <button
                        onClick={() => unfreezeM.mutate(c.id)}
                        disabled={unfreezeM.isPending}
                        className="rounded-full border border-brand-line bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40 disabled:opacity-50"
                      >
                        Volver a su horario
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
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

function groupByDay(list: any[]): Array<[string, any[]]> {
  const map = new Map<string, any[]>();
  for (const c of list) {
    const k = dateFmt.format(new Date(c.startsAt));
    const arr = map.get(k) ?? [];
    arr.push(c);
    map.set(k, arr);
  }
  return Array.from(map.entries());
}

function StatusBadge({ c }: { c: any }) {
  const map: Record<string, { label: string; cls: string }> = {
    scheduled: { label: "Programada", cls: "bg-brand-cream text-brand-ink" },
    validated: { label: "Validada", cls: "bg-green-100 text-green-800" },
    no_show: { label: "No asistió", cls: "bg-red-100 text-red-800" },
    pending_reschedule: { label: "Por reprogramar", cls: "bg-amber-100 text-amber-900" },
    cancelled: { label: "Cancelada", cls: "bg-zinc-100 text-zinc-700" },
    rescheduled: { label: "Reprogramada", cls: "bg-amber-100 text-amber-800" },
  };
  const m = map[c.status] ?? { label: c.status, cls: "bg-brand-cream text-brand-ink" };
  const extra = c.teacherValidatedAt ? " · validada" : c.studentConfirmedAt ? " · pendiente validar" : "";
  return <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.cls}`}>{m.label}{extra}</span>;
}
