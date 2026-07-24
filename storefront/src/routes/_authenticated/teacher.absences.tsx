import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { teachersApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/teacher/absences")({
  head: () => ({ meta: [{ title: "Ausencias — Freakn for Teachers" }] }),
  component: AbsencesPage,
});

const REASONS = ["Vacaciones", "Cita médica", "Enfermedad", "Otro"];
const dayFmt = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "2-digit", month: "long" });
const timeFmt = new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" });

function AbsencesPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState(REASONS[0]);

  // Clases futuras programadas (próximas semanas) para "tachar".
  const upcomingQ = useQuery({ queryKey: ["teacher", "upcoming-abs"], queryFn: () => teachersApi.schedule("upcoming") });
  const absQ = useQuery({ queryKey: ["teacher", "absences"], queryFn: () => teachersApi.absences() });

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const c of (upcomingQ.data ?? []) as any[]) {
      const k = dayFmt.format(new Date(c.startsAt));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    return Array.from(map.entries());
  }, [upcomingQ.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["teacher", "upcoming-abs"] });
    qc.invalidateQueries({ queryKey: ["teacher", "absences"] });
    qc.invalidateQueries({ queryKey: ["teacher", "calendar"] });
  };

  const createM = useMutation({
    mutationFn: () => teachersApi.createAbsencesByClasses(Array.from(selected), reason),
    onSuccess: (r) => {
      toast.success(`${r.cancelled} clase(s) marcadas como ausencia. Estudiantes y admin notificados.`);
      setSelected(new Set());
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo registrar"),
  });
  const delM = useMutation({
    mutationFn: (id: string) => teachersApi.deleteAbsence(id),
    onSuccess: () => { toast.success("Ausencia eliminada; la clase vuelve a quedar programada."); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo eliminar"),
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm text-brand-ink/65">Portal de profesores</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">Ausencias</h1>
        <p className="mt-2 max-w-xl text-brand-ink/70">
          Tacha las clases a las que no podrás asistir. Cada clase marcada se cancela, el estudiante
          recibe aviso y el administrador coordina la reposición. Tu disponibilidad para nuevas
          asignaciones no cambia.
        </p>
      </header>

      <section className="rounded-3xl border border-brand-line bg-white p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-brand-ink">Próximas clases</h2>
          <div className="flex items-center gap-2">
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-full border border-brand-line bg-white px-3 py-2 text-sm">
              {REASONS.map((r) => (<option key={r} value={r}>{r}</option>))}
            </select>
            <button
              onClick={() => createM.mutate()}
              disabled={selected.size === 0 || createM.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 disabled:opacity-50"
            >
              <CalendarOff className="size-4" />
              {createM.isPending ? "Guardando…" : `Marcar ausencia (${selected.size})`}
            </button>
          </div>
        </div>

        {upcomingQ.isLoading ? (
          <p className="mt-4 text-sm text-brand-ink/60">Cargando clases…</p>
        ) : grouped.length === 0 ? (
          <p className="mt-4 text-sm text-brand-ink/65">No tienes clases programadas próximamente.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            {grouped.map(([day, classes]) => (
              <div key={day}>
                <div className="text-xs font-semibold uppercase tracking-wide text-brand-ink/55 first-letter:uppercase">{day}</div>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {classes.map((c: any) => {
                    const on = selected.has(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggle(c.id)}
                        className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${
                          on
                            ? "border-red-300 bg-red-50 text-red-700"
                            : "border-brand-line bg-white text-brand-ink hover:bg-brand-cream/40"
                        }`}
                      >
                        <span className={on ? "line-through" : ""}>
                          {timeFmt.format(new Date(c.startsAt))} · {c.student?.fullName ?? "Estudiante"}
                        </span>
                        {on ? <CalendarOff className="size-3.5" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-brand-line bg-white p-6 md:p-8">
        <h2 className="text-lg font-bold text-brand-ink">Ausencias registradas</h2>
        <p className="mt-1 text-xs text-brand-ink/55">
          <Undo2 className="mr-1 inline size-3" />
          Eliminar una ausencia futura restaura la clase cancelada.
        </p>
        {absQ.isLoading ? (
          <p className="mt-3 text-sm text-brand-ink/60">Cargando…</p>
        ) : (absQ.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-brand-ink/65">No tienes ausencias registradas.</p>
        ) : (
          <ul className="mt-4 divide-y divide-brand-line">
            {(absQ.data ?? []).map((a: any) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div className="text-sm">
                  <div className="font-semibold text-brand-ink first-letter:uppercase">
                    {dayFmt.format(new Date(a.startsAt))} · {timeFmt.format(new Date(a.startsAt))}–{timeFmt.format(new Date(a.endsAt))}
                  </div>
                  <div className="text-xs text-brand-ink/55">{a.reason ?? "—"}</div>
                </div>
                <button
                  onClick={() => delM.mutate(a.id)}
                  disabled={delM.isPending}
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand-line px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  <Trash2 className="size-3.5" /> Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
