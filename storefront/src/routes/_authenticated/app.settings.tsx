import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getActiveSubscription } from "@/lib/domain/subscriptions";
import { PLANS } from "@/lib/domain/plans";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({ meta: [{ title: "Configuración — Freakn English" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, signOut } = useAuth();
  if (!user) return null;
  const sub = getActiveSubscription(user.id);
  const plan = sub ? PLANS.find((p) => p.id === sub.planId) : null;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">
          Configuración
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-brand-ink/65">
          Gestiona tu cuenta y tu suscripción.
        </p>
      </header>

      <section className="rounded-3xl border border-brand-line bg-white p-6 md:p-8">
        <h2 className="text-lg font-bold text-brand-ink">Perfil</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <Row label="Nombre" value={user.fullName} />
          <Row label="Email" value={user.email} />
          <Row label="Rol" value={user.roles.join(", ")} />
          <Row label="Nivel" value={user.level ?? "Por definir"} />
        </dl>
      </section>

      <section className="rounded-3xl border border-brand-line bg-white p-6 md:p-8">
        <h2 className="text-lg font-bold text-brand-ink">Suscripción</h2>
        {sub && plan ? (
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <Row label="Plan" value={plan.name} />
            <Row label="Estado" value={sub.status} />
            <Row
              label="Próximo cobro"
              value={
                sub.currentPeriodEnd
                  ? new Date(sub.currentPeriodEnd).toLocaleDateString("es-CO")
                  : "—"
              }
            />
            <Row
              label="Precio mensual"
              value={new Intl.NumberFormat("es-CO", {
                style: "currency",
                currency: "COP",
                maximumFractionDigits: 0,
              }).format(plan.priceCop ?? 0)}
            />
          </dl>
        ) : (
          <p className="mt-3 text-sm text-brand-ink/65">No tienes suscripción activa.</p>
        )}
      </section>

      <section className="rounded-3xl border border-brand-line bg-white p-6 md:p-8">
        <h2 className="text-lg font-bold text-brand-ink">Sesión</h2>
        <p className="mt-1 text-sm text-brand-ink/65">
          Cierra sesión para entrar con otra cuenta.
        </p>
        <button
          onClick={signOut}
          className="mt-4 rounded-full border border-brand-ink/20 px-5 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-cream/40"
        >
          Cerrar sesión
        </button>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-brand-line bg-brand-cream/30 p-4">
      <dt className="text-xs uppercase tracking-wide text-brand-ink/55">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-brand-ink first-letter:uppercase">
        {value}
      </dd>
    </div>
  );
}