import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, ArrowRight } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { plansApi } from "@/lib/api/endpoints";

export const Route = createFileRoute("/checkout/")({
  head: () => ({ meta: [{ title: "Elige tu plan — Freakn English" }] }),
  component: CheckoutSelect,
});

const copFmt = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function CheckoutSelect() {
  const q = useQuery({ queryKey: ["plans"], queryFn: () => plansApi.list() });
  const trm = q.data?.trm?.valueCop ?? 0;
  const plans = (q.data?.plans ?? []).filter((p: any) => p.isActive !== false);

  return (
    <main className="min-h-screen bg-brand-cream px-5 py-12 md:py-16">
      <div className="mx-auto max-w-5xl">
        <Link to="/" aria-label="Inicio" className="inline-block">
          <Logo className="h-8 w-auto" />
        </Link>

        <header className="mt-8 max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-wider text-brand-ink/55">Paso 1 de 3 · Elige tu plan</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-ink md:text-4xl">
            Escoge tu intensidad y empieza a hablar inglés
          </h1>
          <p className="mt-2 text-[15px] text-brand-ink/70">
            Selecciona un plan y continúa al pago seguro con Wompi. Puedes cambiar o cancelar cuando quieras.
          </p>
        </header>

        {q.isLoading ? (
          <p className="mt-8 text-sm text-brand-ink/60">Cargando planes…</p>
        ) : (
          <div className="mt-8 grid gap-5 md:grid-cols-3">
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
                  <p className="mt-1 text-xs text-brand-ink/55">Se cobra {copFmt.format(cop)} vía Wompi (TRM en vivo).</p>
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
