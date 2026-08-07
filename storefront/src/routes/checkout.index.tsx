import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, ArrowRight } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { plansApi, subscriptionsApi } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/checkout/")({
  head: () => ({ meta: [{ title: "Elige tu plan — FreaknEnglish" }] }),
  component: CheckoutSelect,
});

const copFmt = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function CheckoutSelect() {
  const { user, signOut } = useAuth();
  const q = useQuery({ queryKey: ["plans"], queryFn: () => plansApi.list() });
  const subQ = useQuery({
    queryKey: ["me", "subscription"],
    queryFn: () => subscriptionsApi.mine(),
    enabled: !!user,
  });
  const sub = subQ.data as any;
  const end = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const daysLeft = end ? Math.ceil((end.getTime() - Date.now()) / 86400000) : null;
  const activeFar = sub?.status === "active" && daysLeft != null && daysLeft > 5;
  const renewalWindow = sub?.status === "active" && daysLeft != null && daysLeft <= 5;

  if (activeFar) {
    return (
      <main className="min-h-screen bg-brand-cream px-5 py-16">
        <div className="mx-auto max-w-lg">
          <Link to="/" aria-label="Inicio"><Logo className="h-8 w-auto" /></Link>
          <div className="mt-8 rounded-3xl border border-brand-line bg-white p-8 text-center shadow-soft">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-success/10 text-2xl">✅</div>
            <h1 className="mt-4 text-2xl font-bold text-brand-ink">Ya tienes un plan activo</h1>
            <p className="mt-2 text-sm text-brand-ink/65">
              Tu suscripción está vigente hasta el {end!.toLocaleDateString("es-CO", { day: "2-digit", month: "long" })}.
              Podrás renovar cuando falten 5 días o menos.
            </p>
            <Link to="/app" className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-brand-ink px-6 text-sm font-semibold text-white hover:bg-brand-ink-soft">
              Ir a mi portal
            </Link>
            <p className="mt-4 text-xs text-brand-ink/55">
              ¿Quieres comprar un plan para otra persona?{" "}
              <button
                type="button"
                onClick={() => void signOut()}
                className="font-semibold text-brand-ink underline hover:text-brand-ink-soft"
              >
                Cierra sesión
              </button>{" "}
              y hazlo con otra cuenta.
            </p>
          </div>
        </div>
      </main>
    );
  }
  const trm = q.data?.trm?.valueCop ?? 0;
  const plans = (q.data?.plans ?? []).filter((p: any) => p.isActive !== false);

  return (
    <main className="min-h-screen bg-brand-cream px-5 py-12 md:py-16">
      <div className="mx-auto max-w-5xl">
        <Link to="/" aria-label="Inicio" className="inline-block">
          <Logo className="h-8 w-auto" />
        </Link>

        {renewalWindow ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>Renovación anticipada:</strong> tu nuevo mes empieza cuando termine el actual
            ({end!.toLocaleDateString("es-CO", { day: "2-digit", month: "long" })}) — conservas tu horario y profesor.
          </div>
        ) : null}

        <header className="mt-8 max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-wider text-brand-ink/55">Paso 1 de 3 · Elige tu plan</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">
            Escoge tu intensidad y empieza a hablar inglés
          </h1>
          <p className="mt-2 text-[15px] text-brand-ink/70">
            Selecciona un plan y continúa al pago seguro. Puedes cambiar o cancelar cuando quieras.
          </p>
        </header>

        {q.isLoading ? (
          <p className="mt-8 text-sm text-brand-ink/60">Cargando planes…</p>
        ) : (
          <div className={`mt-8 grid gap-5 ${plans.length > 3 ? "sm:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"}`}>
            {plans.map((plan: any) => {
              const cop = plan.priceUsd && trm ? Math.round(plan.priceUsd * trm) : plan.priceCop;
              return (
                <Link
                  key={plan.id}
                  to="/checkout/schedule/$planId"
                  params={{ planId: plan.id }}
                  className="group flex flex-col rounded-3xl border border-brand-line bg-white p-6 shadow-soft transition hover:-translate-y-0.5 hover:border-brand-ink/30"
                >
                  <h2 className="text-xl font-bold text-brand-ink">{plan.name}</h2>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-brand-ink">${plan.priceUsd ?? "—"}</span>
                    <span className="text-sm text-brand-ink/60">USD / mes</span>
                  </div>
                  <p className="mt-1 text-xs text-brand-ink/55">Se cobra {copFmt.format(cop)} (TRM en vivo).</p>
                  <ul className="mt-4 flex-1 space-y-2 text-sm text-brand-ink/85">
                    {(plan.features ?? []).map((f: string) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-brand-success" strokeWidth={3} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <span className="mt-6 inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-brand-ink px-6 text-sm font-semibold text-white transition group-hover:bg-brand-ink-soft">
                    Elegir este plan <ArrowRight className="size-4" />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
