import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  TrendingUp,
  Video,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { SatisfactionDialog } from "@/components/app/SatisfactionDialog";
import {
  confirmAttendance,
  listClassesFor,
  nextClassFor,
  todaysClassFor,
} from "@/lib/domain/classes";
import { levelProgress } from "@/lib/domain/learning";
import { hasAnsweredThisMonth } from "@/lib/domain/survey";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "Mi dashboard — Freakn English" }] }),
  component: DashboardPage,
});

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-CO", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.fullName.split(" ")[0] ?? "estudiante";
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const [showSurvey, setShowSurvey] = useState(false);

  const data = useMemo(() => {
    if (!user) return null;
    const all = listClassesFor(user.id);
    return {
      all,
      next: nextClassFor(user.id),
      today: todaysClassFor(user.id),
      completed: all.filter((c) => c.status === "completed").length,
      progress: levelProgress(user.id, user.level ?? "beginner"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tick]);

  useEffect(() => {
    if (!user) return;
    if (!user.roles.includes("student")) return;
    if (!hasAnsweredThisMonth(user.id)) {
      const t = setTimeout(() => setShowSurvey(true), 1200);
      return () => clearTimeout(t);
    }
  }, [user]);

  if (!user || !data) return null;

  const todayPending =
    data.today && data.today.status === "scheduled" && !data.today.studentConfirmedAt;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm font-medium text-brand-ink/60">¡Hola de nuevo!</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">
          Bienvenido, {firstName}
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-brand-ink/65">
          Tu plan está activo. Confirma tus clases, avanza en tus módulos y prepárate para el
          siguiente checkpoint.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Stat
          icon={CalendarDays}
          label="Próxima clase"
          value={data.next ? fmtWhen(data.next.startsAt) : "Sin agendar"}
          sub={data.next ? `Con ${data.next.teacherName}` : "Agenda desde el calendario"}
        />
        <Stat
          icon={TrendingUp}
          label={`Progreso ${user.level ?? "beginner"}`}
          value={`${data.progress}%`}
          sub="Completa tus módulos"
        />
        <Stat
          icon={CheckCircle2}
          label="Clases completadas"
          value={String(data.completed)}
          sub="Tu racha sigue creciendo"
        />
      </section>

      {todayPending ? (
        <section className="rounded-3xl border border-brand-ink/10 bg-gradient-to-br from-brand-yellow/70 to-brand-yellow-soft p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="max-w-md">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-brand-ink">
                <Video className="size-3.5" /> Hoy tienes clase
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-brand-ink">
                {data.today!.topic}
              </h2>
              <p className="mt-1 text-sm text-brand-ink/75">
                {fmtWhen(data.today!.startsAt)} · {data.today!.teacherName}
              </p>
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              {data.today!.meetingUrl ? (
                <a
                  href={data.today!.meetingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-ink px-6 text-sm font-semibold text-white hover:bg-brand-ink-soft"
                >
                  Entrar a la clase <ExternalLink className="size-4" />
                </a>
              ) : null}
              <button
                onClick={() => {
                  confirmAttendance(data.today!.id);
                  refresh();
                }}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-brand-ink/20 bg-white px-5 text-sm font-semibold text-brand-ink hover:bg-white/80"
              >
                <CheckCircle2 className="size-4" /> Sí, tomé mi clase hoy
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-brand-line bg-gradient-to-br from-brand-cream to-brand-cream-soft p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="max-w-md">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-brand-ink">
                <Sparkles className="size-3.5" /> Sigue tu ritmo
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-brand-ink">
                Avanza en tus módulos mientras llega tu próxima clase
              </h2>
              <p className="mt-2 text-sm text-brand-ink/70">
                Videos, PDFs y prácticas para reforzar lo que ves con tu profesor.
              </p>
            </div>
            <Link
              to="/app/learning"
              className="inline-flex h-11 items-center justify-center rounded-full bg-brand-ink px-6 text-sm font-semibold text-white hover:bg-brand-ink-soft"
            >
              Ir a aprendizaje
            </Link>
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-brand-line bg-white p-6 md:p-8">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-brand-ink">Próximas clases</h3>
          <Link
            to="/app/calendar"
            className="text-sm font-medium text-brand-ink/70 hover:text-brand-ink"
          >
            Ver calendario →
          </Link>
        </div>
        <ul className="mt-4 divide-y divide-brand-line">
          {data.all
            .filter((c) => c.status === "scheduled")
            .slice(0, 4)
            .map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-4 py-3 text-sm"
              >
                <div>
                  <div className="font-semibold text-brand-ink">{c.topic}</div>
                  <div className="text-xs text-brand-ink/55">
                    {fmtWhen(c.startsAt)} · {c.teacherName}
                  </div>
                </div>
                <span className="rounded-full bg-brand-cream px-2.5 py-1 text-[11px] font-medium text-brand-ink/70">
                  {c.durationMin} min
                </span>
              </li>
            ))}
          {data.all.filter((c) => c.status === "scheduled").length === 0 ? (
            <li className="py-6 text-sm text-brand-ink/55">
              No tienes clases programadas. Agenda desde el calendario.
            </li>
          ) : null}
        </ul>
      </section>

      {showSurvey ? (
        <SatisfactionDialog userId={user.id} onClose={() => setShowSurvey(false)} />
      ) : null}
    </div>
  );
}

type IconType = typeof CalendarDays;
function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: IconType;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-brand-line bg-white p-5">
      <div className="flex items-center gap-2 text-xs font-medium text-brand-ink/60">
        <Icon className="size-4" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-brand-ink first-letter:uppercase">
        {value}
      </div>
      <div className="mt-0.5 text-xs text-brand-ink/55">{sub}</div>
    </div>
  );
}