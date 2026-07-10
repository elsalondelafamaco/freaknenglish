import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listClassesForTeacher, teacherValidateAttendance } from "@/lib/domain/classes";
import type { ClassSession } from "@/lib/domain/types";

export const Route = createFileRoute("/_authenticated/teacher/schedule")({
  head: () => ({ meta: [{ title: "Agenda — Freakn for Teachers" }] }),
  component: TeacherSchedule,
});

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  weekday: "long",
  day: "2-digit",
  month: "long",
});
const timeFmt = new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" });

type Filter = "all" | "upcoming" | "past" | "pending";

function TeacherSchedule() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [tick, setTick] = useState(0);
  const teacherId = user?.id ?? "";

  const classes = useMemo(() => listClassesForTeacher(teacherId), [teacherId, tick]);
  const list = useMemo(() => filterList(classes, filter), [classes, filter]);
  const grouped = useMemo(() => groupByDay(list), [list]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-ink">Agenda</h1>
          <p className="mt-1 text-brand-ink/70">
            Tu calendario completo de clases 1-on-1. Valida asistencia desde aquí.
          </p>
        </div>
        <div className="inline-flex rounded-full border border-brand-line bg-white p-1 text-xs">
          {(["upcoming", "all", "past", "pending"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 font-medium transition ${
                filter === f ? "bg-brand-ink text-white" : "text-brand-ink/70 hover:text-brand-ink"
              }`}
            >
              {labelFor(f)}
            </button>
          ))}
        </div>
      </header>

      {grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-line bg-white p-8 text-center text-sm text-brand-ink/65">
          No hay clases en este filtro.
        </div>
      ) : (
        grouped.map(([day, items]) => (
          <section key={day}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-ink/60">
              {day}
            </h2>
            <div className="mt-2 flex flex-col gap-2">
              {items.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-3 rounded-2xl border border-brand-line bg-white p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-start gap-4">
                    <div className="rounded-xl bg-brand-cream px-3 py-2 text-center">
                      <div className="text-xs uppercase text-brand-ink/55">
                        {timeFmt.format(new Date(c.startsAt))}
                      </div>
                      <div className="text-[10px] text-brand-ink/50">{c.durationMin}min</div>
                    </div>
                    <div>
                      <div className="font-semibold text-brand-ink">
                        Estudiante #{c.studentId.slice(-6)}
                      </div>
                      <div className="text-sm text-brand-ink/65">
                        {c.topic ?? "Sesión 1-on-1"}
                      </div>
                      <StatusBadge c={c} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {c.status === "scheduled" || c.studentConfirmedAt ? (
                      <>
                        <button
                          onClick={async () => {
                            await teacherValidateAttendance(c.id, true);
                            setTick((v) => v + 1);
                          }}
                          className="rounded-full border border-brand-line bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40"
                        >
                          Validar
                        </button>
                        <button
                          onClick={async () => {
                            await teacherValidateAttendance(c.id, false);
                            setTick((v) => v + 1);
                          }}
                          className="rounded-full border border-brand-line bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                        >
                          No asistió
                        </button>
                      </>
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
  return f === "upcoming"
    ? "Próximas"
    : f === "all"
      ? "Todas"
      : f === "past"
        ? "Pasadas"
        : "Pendientes";
}

function filterList(list: ClassSession[], f: Filter): ClassSession[] {
  const now = Date.now();
  if (f === "upcoming")
    return list.filter(
      (c) => c.status === "scheduled" && new Date(c.startsAt).getTime() >= now,
    );
  if (f === "past") return list.filter((c) => new Date(c.startsAt).getTime() < now);
  if (f === "pending")
    return list.filter((c) => c.studentConfirmedAt && !c.teacherValidatedAt);
  return list;
}

function groupByDay(list: ClassSession[]): Array<[string, ClassSession[]]> {
  const map = new Map<string, ClassSession[]>();
  for (const c of list) {
    const k = dateFmt.format(new Date(c.startsAt));
    const arr = map.get(k) ?? [];
    arr.push(c);
    map.set(k, arr);
  }
  return Array.from(map.entries());
}

function StatusBadge({ c }: { c: ClassSession }) {
  const map: Record<ClassSession["status"], { label: string; cls: string }> = {
    scheduled: { label: "Programada", cls: "bg-brand-cream text-brand-ink" },
    completed: { label: "Completada", cls: "bg-green-100 text-green-800" },
    missed: { label: "No asistió", cls: "bg-red-100 text-red-800" },
    canceled: { label: "Cancelada", cls: "bg-zinc-100 text-zinc-700" },
  };
  const m = map[c.status];
  const validated = c.teacherValidatedAt
    ? " · validada"
    : c.studentConfirmedAt
      ? " · pendiente validar"
      : "";
  return (
    <span
      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.cls}`}
    >
      {m.label}
      {validated}
    </span>
  );
}