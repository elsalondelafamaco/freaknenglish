import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Clock, ExternalLink, Pencil, X } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  RESCHEDULE_LOCK_HOURS,
  cancelClass,
  canModify,
  confirmAttendance,
  listClassesFor,
  rescheduleClass,
} from "@/lib/domain/classes";
import type { ClassSession } from "@/lib/domain/types";

export const Route = createFileRoute("/_authenticated/app/calendar")({
  head: () => ({ meta: [{ title: "Calendario — Freakn English" }] }),
  component: CalendarPage,
});

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CalendarPage() {
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<ClassSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  const classes = useMemo(
    () => (user ? listClassesFor(user.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, tick],
  );

  const upcoming = classes.filter((c) => c.status === "scheduled");
  const past = classes.filter((c) => c.status !== "scheduled").slice(-6).reverse();

  async function onCancel(c: ClassSession) {
    const r = await cancelClass(c.id);
    if (!r.ok) setError(r.reason ?? "Error");
    else setError(null);
    setTick((t) => t + 1);
  }

  async function onConfirm(c: ClassSession) {
    await confirmAttendance(c.id);
    setTick((t) => t + 1);
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">
          Calendario
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-brand-ink/65">
          Reprograma o cancela con al menos <strong>{RESCHEDULE_LOCK_HOURS}h</strong> de
          anticipación. Después de ese tiempo la clase queda fija.
        </p>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-ink/60">
          <CalendarDays className="size-4" /> Próximas clases
        </h2>
        {upcoming.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-brand-line p-8 text-center text-sm text-brand-ink/55">
            No tienes clases programadas todavía.
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {upcoming.map((c) => {
              const editable = canModify(c);
              return (
                <li
                  key={c.id}
                  className="rounded-2xl border border-brand-line bg-white p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-bold text-brand-ink">{c.topic}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-brand-ink/60">
                        <Clock className="size-3.5" /> {fmtDate(c.startsAt)}
                      </div>
                      <div className="mt-0.5 text-xs text-brand-ink/55">{c.teacherName}</div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        editable
                          ? "bg-brand-cream text-brand-ink/70"
                          : "bg-brand-ink/5 text-brand-ink/45"
                      }`}
                    >
                      {editable ? "Editable" : "Fija"}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {c.meetingUrl ? (
                      <a
                        href={c.meetingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-ink-soft"
                      >
                        Entrar <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                    <button
                      onClick={() => onConfirm(c)}
                      className="rounded-full border border-brand-ink/20 px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40"
                    >
                      Marcar tomada
                    </button>
                    <button
                      disabled={!editable}
                      onClick={() => setEditing(c)}
                      className="inline-flex items-center gap-1 rounded-full border border-brand-ink/20 px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Pencil className="size-3.5" /> Reprogramar
                    </button>
                    <button
                      disabled={!editable}
                      onClick={() => onCancel(c)}
                      className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <X className="size-3.5" /> Cancelar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-ink/60">
          Historial reciente
        </h2>
        <ul className="divide-y divide-brand-line rounded-2xl border border-brand-line bg-white">
          {past.length === 0 ? (
            <li className="p-5 text-sm text-brand-ink/55">Aún no tienes clases pasadas.</li>
          ) : (
            past.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <div className="font-semibold text-brand-ink">{c.topic}</div>
                  <div className="text-xs text-brand-ink/55">
                    {fmtDate(c.startsAt)} · {c.teacherName}
                  </div>
                </div>
                <StatusPill status={c.status} />
              </li>
            ))
          )}
        </ul>
      </section>

      {editing ? (
        <RescheduleDialog
          session={editing}
          onClose={() => setEditing(null)}
          onSave={async (iso) => {
            const r = await rescheduleClass(editing.id, iso);
            if (!r.ok) setError(r.reason ?? "Error");
            else setError(null);
            setEditing(null);
            setTick((t) => t + 1);
          }}
        />
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: ClassSession["status"] }) {
  const map: Record<ClassSession["status"], { label: string; cls: string }> = {
    completed: { label: "Completada", cls: "bg-brand-success/15 text-brand-success" },
    canceled: { label: "Cancelada", cls: "bg-red-100 text-red-700" },
    missed: { label: "No asistió", cls: "bg-orange-100 text-orange-700" },
    scheduled: { label: "Programada", cls: "bg-brand-cream text-brand-ink/70" },
  };
  const v = map[status];
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}

function RescheduleDialog({
  session,
  onClose,
  onSave,
}: {
  session: ClassSession;
  onClose: () => void;
  onSave: (iso: string) => void;
}) {
  // datetime-local needs YYYY-MM-DDTHH:mm
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
        <p className="mt-1 text-sm text-brand-ink/65">
          Elige una nueva fecha y hora. Tu profesor recibirá la actualización.
        </p>
        <input
          type="datetime-local"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="mt-4 w-full rounded-2xl border border-brand-line bg-white px-4 py-3 text-sm text-brand-ink focus:border-brand-ink focus:outline-none"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-brand-ink/70 hover:bg-brand-cream/40"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(new Date(val).toISOString())}
            className="rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white hover:bg-brand-ink-soft"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}