import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Clock, Users, Video, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  listClassesForTeacher,
  listStudentsOfTeacher,
  teacherTodayClasses,
  teacherUpcoming,
  teacherValidateAttendance,
} from "@/lib/domain/classes";

export const Route = createFileRoute("/_authenticated/teacher/")({
  head: () => ({ meta: [{ title: "Hoy — Freakn for Teachers" }] }),
  component: TeacherHome,
});

const timeFmt = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
});

function TeacherHome() {
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  const teacherId = user?.id ?? "";

  const today = useMemo(() => teacherTodayClasses(teacherId), [teacherId, tick]);
  const upcoming = useMemo(
    () => teacherUpcoming(teacherId).slice(0, 5),
    [teacherId, tick],
  );
  const stats = useMemo(() => {
    const all = listClassesForTeacher(teacherId);
    return {
      students: listStudentsOfTeacher(teacherId).length,
      completedWeek: all.filter((c) => {
        const ageDays = (Date.now() - new Date(c.startsAt).getTime()) / 864e5;
        return c.status === "completed" && ageDays < 7;
      }).length,
      pending: all.filter(
        (c) =>
          c.status === "completed" &&
          c.studentConfirmedAt &&
          !c.teacherValidatedAt,
      ).length,
    };
  }, [teacherId, tick]);

  function refresh() {
    setTick((v) => v + 1);
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm text-brand-ink/65">Portal de profesores</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">
          Hola, {user?.fullName.split(" ")[0]} 👋
        </h1>
        <p className="mt-2 text-brand-ink/70">
          Estas son tus clases de hoy y el resumen de tu semana.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat icon={<Users className="size-4" />} label="Estudiantes activos" value={stats.students} />
        <Stat
          icon={<CheckCircle2 className="size-4" />}
          label="Clases completadas (7 días)"
          value={stats.completedWeek}
        />
        <Stat
          icon={<Clock className="size-4" />}
          label="Pendientes por validar"
          value={stats.pending}
          highlight={stats.pending > 0}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-brand-ink">Clases de hoy</h2>
        <div className="mt-3 flex flex-col gap-3">
          {today.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-brand-line bg-white p-6 text-sm text-brand-ink/65">
              No tienes clases programadas hoy.
            </div>
          ) : (
            today.map((c) => (
              <div
                key={c.id}
                className="flex flex-col gap-3 rounded-2xl border border-brand-line bg-white p-5 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-brand-ink/55">
                    {timeFmt.format(new Date(c.startsAt))} · {c.durationMin} min
                  </div>
                  <div className="mt-1 font-semibold text-brand-ink">
                    <Link
                      to="/teacher/students/$studentId"
                      params={{ studentId: c.studentId }}
                      className="hover:underline"
                    >
                      Estudiante #{c.studentId.slice(-6)}
                    </Link>
                  </div>
                  <div className="text-sm text-brand-ink/65">{c.topic ?? "Sesión 1-on-1"}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {c.meetingUrl ? (
                    <a
                      href={c.meetingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white hover:bg-brand-ink-soft"
                    >
                      <Video className="size-3.5" /> Abrir Meet
                    </a>
                  ) : null}
                  <button
                    onClick={async () => {
                      await teacherValidateAttendance(c.id, true);
                      refresh();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-white px-4 py-2 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40"
                  >
                    <CheckCircle2 className="size-3.5" /> Validar asistencia
                  </button>
                  <button
                    onClick={async () => {
                      await teacherValidateAttendance(c.id, false);
                      refresh();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    <XCircle className="size-3.5" /> No asistió
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-ink">Próximas clases</h2>
          <Link
            to="/teacher/schedule"
            className="text-sm font-semibold text-brand-ink hover:underline"
          >
            Ver agenda completa →
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {upcoming.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-brand-line bg-white p-5 text-sm text-brand-ink/65">
              Sin clases programadas próximamente.
            </div>
          ) : (
            upcoming.map((c) => (
              <div key={c.id} className="rounded-2xl border border-brand-line bg-white p-4">
                <div className="text-xs uppercase tracking-wide text-brand-ink/55">
                  {new Date(c.startsAt).toLocaleDateString("es-CO", {
                    weekday: "long",
                    day: "2-digit",
                    month: "short",
                  })}{" "}
                  · {timeFmt.format(new Date(c.startsAt))}
                </div>
                <div className="mt-1 font-semibold text-brand-ink">
                  Estudiante #{c.studentId.slice(-6)}
                </div>
                <div className="text-sm text-brand-ink/65">{c.topic ?? "Sesión 1-on-1"}</div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 ${
        highlight ? "border-brand-ink" : "border-brand-line"
      }`}
    >
      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-ink/65">
        {icon} {label}
      </div>
      <div className="mt-2 text-3xl font-bold text-brand-ink">{value}</div>
    </div>
  );
}