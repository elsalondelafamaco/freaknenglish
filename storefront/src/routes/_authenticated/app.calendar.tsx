import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock, ExternalLink, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { classesApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/app/calendar")({
  head: () => ({ meta: [{ title: "Calendario — Freakn English" }] }),
  component: CalendarPage,
});

const RESCHEDULE_LOCK_HOURS = 24;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("es-CO", { weekday: "long", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
const canModify = (c: any) =>
  c.status === "scheduled" && (new Date(c.startsAt).getTime() - Date.now()) / 3_600_000 >= RESCHEDULE_LOCK_HOURS;

function CalendarPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);
  const classesQ = useQuery({ queryKey: ["classes"], queryFn: () => classesApi.list() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["classes"] });
  const confirmM = useMutation({ mutationFn: (id: string) => classesApi.confirm(id), onSuccess: () => { toast.success("Marcada como tomada"); invalidate(); }, onError: (e: any) => toast.error(e?.message ?? "Error") });
  const cancelM = useMutation({ mutationFn: (id: string) => classesApi.cancel(id), onSuccess: () => { toast.success("Clase cancelada"); invalidate(); }, onError: (e: any) => toast.error(e?.message ?? "No se pudo cancelar") });
  const rescheduleM = useMutation({
    mutationFn: ({ id, startsAt, endsAt }: { id: string; startsAt: string; endsAt: string }) => classesApi.reschedule(id, startsAt, endsAt),
    onSuccess: () => { toast.success("Clase reprogramada"); invalidate(); setEditing(null); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo reprogramar"),
  });

  const classes = (classesQ.data ?? []) as any[];
  const upcoming = classes.filter((c) => c.status === "scheduled");
  const past = classes.filter((c) => c.status !== "scheduled").slice(-6).reverse();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">Calendario</h1>
        <p className="mt-2 max-w-xl text-[15px] text-brand-ink/65">
          Tu horario semanal fijo. ¿Necesitas mover o cancelar una clase? Coordínalo directamente con tu
          profesor: él puede reprogramarla desde su calendario.
        </p>
      </header>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-ink/60">
          <CalendarDays className="size-4" /> Próximas clases
        </h2>
        {classesQ.isLoading ? (
          <div className="text-sm text-brand-ink/55">Cargando…</div>
        ) : upcoming.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-brand-line p-8 text-center text-sm text-brand-ink/55">
            No tienes clases programadas todavía.
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {upcoming.map((c) => {
              const editable = canModify(c);
              return (
                <li key={c.id} className="rounded-2xl border border-brand-line bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-bold text-brand-ink">{c.topic ?? "Sesión 1-on-1"}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-brand-ink/60"><Clock className="size-3.5" /> {fmtDate(c.startsAt)}</div>
                      <div className="mt-0.5 text-xs text-brand-ink/55">{c.teacher?.fullName ?? "tu profe"}</div>
                    </div>

                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {c.meetingUrl ? (
                      <a href={c.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-ink-soft">
                        Entrar <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                    <button onClick={() => confirmM.mutate(c.id)} disabled={confirmM.isPending} className="rounded-full border border-brand-ink/20 px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40 disabled:opacity-50">
                      Marcar tomada
                    </button>
                    <span className="inline-flex items-center rounded-full bg-brand-cream/60 px-3 py-1.5 text-[11px] text-brand-ink/60">
                      ¿Cambio de horario? Coordínalo con tu profe
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-ink/60">Historial reciente</h2>
        <ul className="divide-y divide-brand-line rounded-2xl border border-brand-line bg-white">
          {past.length === 0 ? (
            <li className="p-5 text-sm text-brand-ink/55">Aún no tienes clases pasadas.</li>
          ) : (
            past.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <div className="font-semibold text-brand-ink">{c.topic ?? "Sesión 1-on-1"}</div>
                  <div className="text-xs text-brand-ink/55">{fmtDate(c.startsAt)} · {c.teacher?.fullName ?? "tu profe"}</div>
                </div>
                <StatusPill status={c.status} />
              </li>
            ))
          )}
        </ul>
      </section>


    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    validated: { label: "Completada", cls: "bg-brand-success/15 text-brand-success" },
    cancelled: { label: "Cancelada", cls: "bg-red-100 text-red-700" },
    no_show: { label: "No asistió", cls: "bg-orange-100 text-orange-700" },
    rescheduled: { label: "Reprogramada", cls: "bg-brand-cream text-brand-ink/70" },
    scheduled: { label: "Programada", cls: "bg-brand-cream text-brand-ink/70" },
  };
  const v = map[status] ?? { label: status, cls: "bg-brand-cream text-brand-ink/70" };
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${v.cls}`}>{v.label}</span>;
}

function RescheduleDialog({ session, onClose, onSave }: { session: any; onClose: () => void; onSave: (iso: string) => void }) {
  const initial = (() => {
    const d = new Date(session.startsAt);
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
  })();
  const [val, setVal] = useState(initial);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-brand-line bg-white p-6">
        <h3 className="text-lg font-bold text-brand-ink">Reprogramar clase</h3>
        <p className="mt-1 text-sm text-brand-ink/65">Elige una nueva fecha y hora. Tu profesor recibirá la actualización.</p>
        <input type="datetime-local" value={val} onChange={(e) => setVal(e.target.value)} className="mt-4 w-full rounded-2xl border border-brand-line bg-white px-4 py-3 text-sm text-brand-ink focus:border-brand-ink focus:outline-none" />
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-brand-ink/70 hover:bg-brand-cream/40">Cancelar</button>
          <button onClick={() => onSave(new Date(val).toISOString())} className="rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white hover:bg-brand-ink-soft">Guardar</button>
        </div>
      </div>
    </div>
  );
}
