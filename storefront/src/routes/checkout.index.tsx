import { createFileRoute, Link } from "@tanstack/react-router";
import { useRenovacion } from "@/lib/domain/renovacion";
import { copAcobrar } from "@/lib/domain/plans";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
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
  const { esRenovacion, cargando: cargandoRenovacion } = useRenovacion();
  const renewalWindow = sub?.status === "active" && daysLeft != null && daysLeft <= 5;

  if (activeFar) {
    return (
      <main className="min-h-screen bg-brand-cream px-5 py-16">
        <div className="mx-auto max-w-lg">
          <Link to="/" aria-label="Inicio"><Logo className="h-8 w-auto" /></Link>
          <div className="shadow-hard mt-8 border-2 border-brand-ink bg-white p-8 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-success/10 text-2xl">✅</div>
            <h1 className="mt-4 font-display text-2xl font-extrabold uppercase text-brand-ink">Ya tienes un plan activo</h1>
            <p className="mt-2 text-sm text-brand-ink/65">
              Tu suscripción está vigente hasta el {end!.toLocaleDateString("es-CO", { day: "2-digit", month: "long" })}.
              Podrás renovar cuando falten 5 días o menos.
            </p>
            <Link to="/app" className="shadow-hard press-hard mt-6 inline-flex h-12 items-center justify-center rounded-full bg-brand-ink px-7 font-display text-sm font-bold uppercase tracking-[0.03em] text-brand-cream [--hard-x:5px]">
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
          <div className="mt-6 border-2 border-brand-ink bg-brand-yellow-soft px-4 py-3 text-sm text-brand-ink">
            <strong>Renovación anticipada:</strong> tu nuevo mes empieza cuando termine el actual
            ({end!.toLocaleDateString("es-CO", { day: "2-digit", month: "long" })}) — conservas tu horario y profesor.
          </div>
        ) : null}

        <header className="mt-8 max-w-2xl">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-ink/60">Paso 1 de 3 · Elige tu plan</p>
          <h1 className="mt-3 font-display text-4xl font-extrabold uppercase leading-[1.02] tracking-[-0.02em] text-brand-ink md:text-[52px]">
            Escoge tu intensidad y empieza a <span className="marker-highlight">hablar inglés.</span>
          </h1>
          <p className="mt-2 text-[15px] text-brand-ink/70">
            Selecciona un plan y continúa al pago seguro. Puedes cambiar o cancelar cuando quieras.
          </p>
        </header>

        {/* Se espera también a saber si renueva: si no, las tarjetas nacen
            apuntando al selector de horario y el estudiante llega allí antes de
            que la respuesta corrija el destino. */}
        {q.isLoading || cargandoRenovacion ? (
          <p className="mt-8 text-sm text-brand-ink/60">Cargando planes…</p>
        ) : (
          <div className={`mt-10 grid gap-8 ${plans.length > 3 ? "sm:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"}`}>
            {plans.map((plan: any) => {
              const cop = copAcobrar(plan, trm);
              return (
                <Link
                  key={plan.id}
                  // Renovar no vuelve a preguntar el horario: el banner de
                  // arriba lleva prometiendo "conservas tu horario y profesor"
                  // desde siempre, y hasta ahora nadie sostenía esa promesa.
                  to={esRenovacion ? "/checkout/$planId" : "/checkout/schedule/$planId"}
                  params={{ planId: plan.id }}
                  className="shadow-hard group flex flex-col border-2 border-brand-ink bg-white p-7 transition-transform duration-300 hover:-translate-y-1.5"
                >
                  <h2 className="font-display text-[24px] font-extrabold uppercase leading-none text-brand-ink">{plan.name}</h2>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="font-display text-[42px] font-extrabold leading-none text-brand-ink">${plan.priceUsd ?? "—"}</span>
                    <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-brand-ink/55">USD / mes</span>
                  </div>
                  <p className="mt-2 text-xs text-brand-ink/55">Se cobra {copFmt.format(cop)} (TRM en vivo).</p>
                  <ul className="mt-4 flex-1 space-y-2 text-sm text-brand-ink/85">
                    {(plan.features ?? []).map((f: string) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <span className="mt-0.5 text-[12px] text-brand-yellow">✦</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <span className="shadow-hard press-hard mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-ink px-6 font-display text-[14px] font-bold uppercase tracking-[0.04em] text-brand-cream [--hard-x:5px]">
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
