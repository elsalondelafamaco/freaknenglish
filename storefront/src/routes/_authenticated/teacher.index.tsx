import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, LayoutGrid, Users, Video, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/AuthProvider";
import { classesApi, teachersApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/teacher/")({
  head: () => ({ meta: [{ title: "Hoy — Freakn for Teachers" }] }),
  component: TeacherHome,
});

const timeFmt = new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" });
const durMin = (c: any) =>
  Math.max(0, Math.round((new Date(c.endsAt).getTime() - new Date(c.startsAt).getTime()) / 60000)) || 50;

function TeacherHome() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const todayQ = useQuery({ queryKey: ["teacher", "today"], queryFn: () => classesApi.todayForTeacher() });
  const upcomingQ = useQuery({ queryKey: ["teacher", "upcoming"], queryFn: () => teachersApi.schedule("upcoming") });
  const studentsQ = useQuery({ queryKey: ["teacher", "students"], queryFn: () => teachersApi.students() });
  const allQ = useQuery({ queryKey: ["teacher", "all"], queryFn: () => teachersApi.schedule() });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["teacher", "today"] });
    qc.invalidateQueries({ queryKey: ["teacher", "all"] });
  };
  const validateM = useMutation({
    mutationFn: (id: string) => classesApi.validate(id),
    onSuccess: () => { toast.success("Asistencia validada"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo validar"),
  });
  const noShowM = useMutation({
    mutationFn: (id: string) => classesApi.noShow(id),
    onSuccess: () => { toast.success("Marcado como no asistió"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo marcar"),
  });

  const today = todayQ.data ?? [];
  const upcoming = (upcomingQ.data ?? []).slice(0, 6);
  const all = (allQ.data ?? []) as any[];
  const stats = {
    students: studentsQ.data?.length ?? 0,
    completedWeek: all.filter(
      (c) => c.status === "validated" && (Date.now() - new Date(c.startsAt).getTime()) / 864e5 < 7,
    ).length,
    pending: all.filter((c: any) => c.studentConfirmedAt && !c.teacherValidatedAt).length,
  };

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm text-brand-ink/65">Portal de profesores</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">
          Hola, {user?.fullName.split(" ")[0]} 👋
        </h1>
        <p className="mt-2 text-brand-ink/70">Estas son tus clases de hoy y el resumen de tu semana.</p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat icon={<Users className="size-4" />} label="Estudiantes activos" value={stats.students} />
        <Stat icon={<CheckCircle2 className="size-4" />} label="Clases validadas (7 días)" value={stats.completedWeek} />
        <Stat icon={<Clock className="size-4" />} label="Pendientes por validar" value={stats.pending} highlight={stats.pending > 0} />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-brand-ink">Clases de hoy</h2>
        <div className="mt-3 flex flex-col gap-3">
          {todayQ.isLoading ? (
            <p className="text-sm text-brand-ink/60">Cargando…</p>
          ) : today.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-brand-line bg-white p-6 text-sm text-brand-ink/65">
              No tienes clases programadas hoy.
            </div>
          ) : (
            today.map((c: any) => (
              <div key={c.id} className="flex flex-col gap-3 rounded-2xl border border-brand-line bg-white p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-brand-ink/55">
                    {timeFmt.format(new Date(c.startsAt))} · {durMin(c)} min
                    {c.studentConfirmedAt && !c.teacherValidatedAt ? " · el estudiante confirmó" : ""}
                  </div>
                  <div className="mt-1 font-semibold text-brand-ink">
                    <Link to="/teacher/students/$studentId" params={{ studentId: c.studentId }} className="hover:underline">
                      {c.student?.fullName ?? `Estudiante #${String(c.studentId).slice(-6)}`}
                    </Link>
                  </div>
                  <div className="text-sm text-brand-ink/65">{c.topic ?? "Sesión 1-on-1"}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {c.student?.meetingUrl ? (
                    <a href={c.student.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white hover:bg-brand-ink-soft">
                      <Video className="size-3.5" /> Entrar
                    </a>
                  ) : null}
                  {c.meetingUrl ? (
                    <a href={c.meetingUrl} className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-white px-4 py-2 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40">
                      <LayoutGrid className="size-3.5" /> Board
                    </a>
                  ) : null}
                  <button
                    disabled={validateM.isPending}
                    onClick={() => validateM.mutate(c.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-white px-4 py-2 text-xs font-semibold text-brand-ink hover:bg-brand-cream/40 disabled:opacity-60"
                  >
                    <CheckCircle2 className="size-3.5" /> Validar asistencia
                  </button>
                  <button
                    disabled={noShowM.isPending}
                    onClick={() => noShowM.mutate(c.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
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
          <Link to="/teacher/schedule" className="text-sm font-semibold text-brand-ink hover:underline">
            Ver agenda completa →
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {upcoming.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-brand-line bg-white p-5 text-sm text-brand-ink/65">
              Sin clases programadas próximamente.
            </div>
          ) : (
            upcoming.map((c: any) => (
              <div key={c.id} className="rounded-2xl border border-brand-line bg-white p-4 transition hover:shadow-soft">
                <div className="text-xs uppercase tracking-wide text-brand-ink/55">
                  {new Date(c.startsAt).toLocaleDateString("es-CO", { weekday: "long", day: "2-digit", month: "short" })}{" "}
                  · {timeFmt.format(new Date(c.startsAt))}
                </div>
                <div className="mt-1 font-semibold text-brand-ink">
                  {c.student?.fullName ?? `Estudiante #${String(c.studentId).slice(-6)}`}
                </div>
                <div className="text-sm text-brand-ink/65">{c.topic ?? "Sesión 1-on-1"}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.student?.meetingUrl ? (
                    <a href={c.student.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-ink-soft">
                      <Video className="size-3" /> Entrar
                    </a>
                  ) : null}
                  {c.meetingUrl ? (
                    <a href={c.meetingUrl} className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-white px-3 py-1.5 text-[11px] font-semibold text-brand-ink hover:bg-brand-cream/40">
                      <LayoutGrid className="size-3" /> Board
                    </a>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white p-5 ${highlight ? "border-brand-ink" : "border-brand-line"}`}>
      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-ink/65">
        {icon} {label}
      </div>
      <div className="mt-2 text-3xl font-bold text-brand-ink">{value}</div>
    </div>
  );
}
