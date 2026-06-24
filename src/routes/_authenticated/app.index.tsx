import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, Sparkles, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "Mi dashboard — Freakn English" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.fullName.split(" ")[0] ?? "estudiante";

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm font-medium text-brand-ink/60">¡Hola de nuevo!</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">
          Bienvenido, {firstName}
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-brand-ink/65">
          Este es tu espacio. Pronto vas a poder gestionar tus clases, ver tu progreso y acceder a
          tus módulos.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Stat icon={CalendarDays} label="Próxima clase" value="Mañana, 7:00 PM" sub="Con Teacher Sofía" />
        <Stat icon={TrendingUp} label="Progreso de fluidez" value="0%" sub="Completa tu nivelación" />
        <Stat icon={CheckCircle2} label="Clases completadas" value="0" sub="Aún no has empezado" />
      </section>

      <section className="rounded-3xl border border-brand-line bg-gradient-to-br from-brand-cream to-brand-cream-soft p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="max-w-md">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-brand-ink">
              <Sparkles className="size-3.5" /> Siguiente paso
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-brand-ink">
              Completa tu nivelación para activar tu plan
            </h2>
            <p className="mt-2 text-sm text-brand-ink/70">
              Una prueba corta para ubicarte en el nivel ideal: principiante, intermedio o avanzado.
            </p>
          </div>
          <Link
            to="/app"
            className="inline-flex h-11 items-center justify-center rounded-full bg-brand-ink px-6 text-sm font-semibold text-white hover:bg-brand-ink-soft"
          >
            Empezar nivelación
          </Link>
        </div>
      </section>

      <section className="rounded-3xl border border-dashed border-brand-line p-6 text-sm text-brand-ink/60">
        Pronto: calendario interactivo, módulos por nivel, checkpoints y encuestas de satisfacción.
      </section>
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
      <div className="mt-2 text-2xl font-bold text-brand-ink">{value}</div>
      <div className="mt-0.5 text-xs text-brand-ink/55">{sub}</div>
    </div>
  );
}