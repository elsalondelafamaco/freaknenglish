import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, ExternalLink, Sparkles, TrendingUp, Video } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/AuthProvider";
import { classesApi, learningApi, subscriptionsApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "Mi dashboard — FreaknEnglish" }] }),
  component: DashboardPage,
});

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", { weekday: "long", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
const durMin = (c: any) => Math.max(0, Math.round((new Date(c.endsAt).getTime() - new Date(c.startsAt).getTime()) / 60000)) || 50;
const isToday = (iso: string) => { const d = new Date(iso), n = new Date(); return d.toDateString() === n.toDateString(); };

const daysLeeftOk = (d: number | null) => d != null && d <= 5 && d >= 0;

function DashboardPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const subQ = useQuery({ queryKey: ["me", "subscription"], queryFn: () => subscriptionsApi.mine(), staleTime: 0 });
  const firstName = user?.fullName.split(" ")[0] ?? "estudiante";

  const allQ = useQuery({ queryKey: ["classes"], queryFn: () => classesApi.list() });
  const nextQ = useQuery({ queryKey: ["classes", "upcoming"], queryFn: () => classesApi.upcoming() });
  const modsQ = useQuery({ queryKey: ["learning", "modules", user?.level ?? "beginner"], queryFn: () => learningApi.modules(user?.level ?? "beginner"), enabled: !!user });
  const progQ = useQuery({ queryKey: ["learning", "progress"], queryFn: () => learningApi.progress() });

  const confirmM = useMutation({
    mutationFn: (id: string) => classesApi.confirm(id),
    onSuccess: () => { toast.success("¡Asistencia confirmada!"); qc.invalidateQueries({ queryKey: ["classes"] }); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo confirmar"),
  });

  if (!user) return null;

  const subStatus = (subQ.data as any)?.status ?? null;
  const subActive = subStatus === "active";
  if (!subQ.isLoading && !subActive) {
    const msg =
      subStatus === "past_due" || subStatus === "expired"
        ? "Tu suscripción venció. Renueva tu plan para seguir tomando clases."
        : subStatus === "pending"
          ? "Tu pago está en proceso. Te avisaremos apenas se confirme."
          : "Aún no tienes un plan activo. Elige uno para empezar tus clases 1‑a‑1.";
    return (
      <div className="flex flex-col gap-8">
        <header>
          <p className="text-sm font-medium text-brand-ink/60">¡Hola, {firstName}!</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">Tu cuenta está lista</h1>
        </header>
        <section className="rounded-3xl border border-brand-line bg-gradient-to-br from-brand-yellow/70 to-brand-yellow-soft p-8 md:p-10">
          <div className="max-w-lg">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-brand-ink">
              Estado de tu suscripción
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-brand-ink">{msg}</h2>
            <p className="mt-2 text-sm text-brand-ink/70">
              Cuando tu plan esté activo se desbloquean tu calendario, tus clases 1‑a‑1 y el módulo de aprendizaje.
            </p>
            <a
              href="/checkout"
              className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-brand-ink px-6 text-sm font-semibold text-white hover:bg-brand-ink-soft"
            >
              {subStatus === "past_due" || subStatus === "expired" ? "Renovar mi plan" : "Elegir un plan"}
            </a>
          </div>
        </section>
      </div>
    );
  }

  const all = (allQ.data ?? []) as any[];
  const next = nextQ.data as any;
  const today = all.find((c) => isToday(c.startsAt) && c.status === "scheduled");
  const completed = all.filter((c) => c.status === "validated").length;
  const doneIds = new Set(progQ.data?.completedLessonIds ?? []);
  const lessons = (modsQ.data ?? []).flatMap((m: any) => m.lessons ?? []);
  const pct = lessons.length ? Math.round((lessons.filter((l: any) => doneIds.has(l.id)).length / lessons.length) * 100) : 0;
  const todayPending = today && !today.studentConfirmedAt;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm font-medium text-brand-ink/60">¡Hola de nuevo!</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">Bienvenido, {firstName}</h1>
        <p className="mt-2 max-w-xl text-[15px] text-brand-ink/65">
          Confirma tus clases, avanza en tus módulos y prepárate para el siguiente checkpoint.
        </p>
      </header>

      {(() => {
        const end = (subQ.data as any)?.currentPeriodEnd ? new Date((subQ.data as any).currentPeriodEnd) : null;
        const daysLeft = end ? Math.ceil((end.getTime() - Date.now()) / 86400000) : null;
        if (subStatus === "active" && daysLeeftOk(daysLeft)) {
          return (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-amber-900">
                    Tu plan vence {daysLeft === 0 ? "hoy" : daysLeft === 1 ? "mañana" : `en ${daysLeft} días`}
                    {end ? ` (${end.toLocaleDateString("es-CO", { day: "2-digit", month: "long" })})` : ""}
                  </div>
                  <p className="mt-0.5 text-xs text-amber-800/80">
                    Renueva ahora y tu nuevo mes empieza justo cuando termine el actual — sin perder tu horario ni tu profesor.
                  </p>
                </div>
                <a href="/checkout" className="inline-flex h-10 items-center rounded-full bg-brand-ink px-5 text-sm font-semibold text-white hover:bg-brand-ink-soft">
                  Renovar ahora
                </a>
              </div>
            </section>
          );
        }
        return null;
      })()}

      {user.scheduleAssignmentStatus === "manual_pending" ? (
        <section className="rounded-3xl border border-brand-line bg-brand-yellow-soft p-6 md:p-7">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-brand-ink">
            <Sparkles className="size-3.5" /> Estamos coordinando tu profesor
          </div>
          <p className="mt-2 max-w-xl text-sm text-brand-ink/75">
            Tu cupo está garantizado. Nuestro equipo te contacta en menos de 24&nbsp;h hábiles para
            coordinar tu profesor y el inicio de tus clases. Mientras tanto, puedes avanzar en tus módulos.
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <Stat icon={CalendarDays} label="Próxima clase" value={next ? fmtWhen(next.startsAt) : "Sin agendar"} sub={next ? `Con ${next.teacher?.fullName ?? "tu profe"}` : "Agenda desde el calendario"} />
        <Stat icon={TrendingUp} label={`Progreso ${user.level ?? "beginner"}`} value={`${pct}%`} sub="Completa tus módulos" />
        <Stat icon={CheckCircle2} label="Clases completadas" value={String(completed)} sub="Tu racha sigue creciendo" />
      </section>

      {todayPending ? (
        <section className="rounded-3xl border border-brand-ink/10 bg-gradient-to-br from-brand-yellow/70 to-brand-yellow-soft p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="max-w-md">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-brand-ink">
                <Video className="size-3.5" /> Hoy tienes clase
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-brand-ink">{today.topic ?? "Sesión 1-on-1"}</h2>
              <p className="mt-1 text-sm text-brand-ink/75">{fmtWhen(today.startsAt)} · {today.teacher?.fullName ?? "tu profe"}</p>
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              {today.meetingUrl ? (
                <a href={today.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-ink px-6 text-sm font-semibold text-white hover:bg-brand-ink-soft">
                  Entrar a la clase <ExternalLink className="size-4" />
                </a>
              ) : null}
              <button onClick={() => confirmM.mutate(today.id)} disabled={confirmM.isPending} className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-brand-ink/20 bg-white px-5 text-sm font-semibold text-brand-ink hover:bg-white/80 disabled:opacity-60">
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
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-brand-ink">Avanza en tus módulos mientras llega tu próxima clase</h2>
              <p className="mt-2 text-sm text-brand-ink/70">Videos, PDFs y prácticas para reforzar lo que ves con tu profesor.</p>
            </div>
            <Link to="/app/learning" className="inline-flex h-11 items-center justify-center rounded-full bg-brand-ink px-6 text-sm font-semibold text-white hover:bg-brand-ink-soft">
              Ir a aprendizaje
            </Link>
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-brand-line bg-white p-6 md:p-8">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-brand-ink">Próximas clases</h3>
          <Link to="/app/calendar" className="text-sm font-medium text-brand-ink/70 hover:text-brand-ink">Ver calendario →</Link>
        </div>
        <ul className="mt-4 divide-y divide-brand-line">
          {all.filter((c) => c.status === "scheduled").slice(0, 4).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-4 py-3 text-sm">
              <div>
                <div className="font-semibold text-brand-ink">{c.topic ?? "Sesión 1-on-1"}</div>
                <div className="text-xs text-brand-ink/55">{fmtWhen(c.startsAt)} · {c.teacher?.fullName ?? "tu profe"}</div>
              </div>
              <span className="rounded-full bg-brand-cream px-2.5 py-1 text-[11px] font-medium text-brand-ink/70">{durMin(c)} min</span>
            </li>
          ))}
          {all.filter((c) => c.status === "scheduled").length === 0 ? (
            <li className="py-6 text-sm text-brand-ink/55">No tienes clases programadas. Agenda desde el calendario.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

type IconType = typeof CalendarDays;
function Stat({ icon: Icon, label, value, sub }: { icon: IconType; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-brand-line bg-white p-5">
      <div className="flex items-center gap-2 text-xs font-medium text-brand-ink/60"><Icon className="size-4" />{label}</div>
      <div className="mt-2 text-2xl font-bold text-brand-ink first-letter:uppercase">{value}</div>
      <div className="mt-0.5 text-xs text-brand-ink/55">{sub}</div>
    </div>
  );
}
