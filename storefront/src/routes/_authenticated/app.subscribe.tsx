import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { PLANS, formatCop } from "@/lib/domain/plans";

export const Route = createFileRoute("/_authenticated/app/subscribe")({
  head: () => ({ meta: [{ title: "Elige tu plan — Freakn English" }] }),
  component: SubscribePage,
});

function SubscribePage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-brand-ink/55">
          Paso 1 de 4
        </p>
        <h1 className="mt-1 text-2xl font-bold text-brand-ink md:text-3xl">
          Elige tu plan para empezar
        </h1>
        <p className="mt-1 max-w-xl text-sm text-brand-ink/65">
          Selecciona la intensidad que se adapta a tus objetivos. Podrás cambiar
          o cancelar en cualquier momento desde tu configuración.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className="flex flex-col rounded-3xl border border-brand-line bg-white p-6 shadow-soft"
          >
            {plan.tag ? (
              <p className="text-xs font-medium text-brand-ink/60">{plan.tag}</p>
            ) : null}
            <h2 className="mt-1 text-xl font-bold text-brand-ink">{plan.name}</h2>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-brand-ink">{plan.priceDisplay}</span>
              <span className="text-sm text-brand-ink/60">USD / mes</span>
            </div>
            <p className="mt-1 text-xs text-brand-ink/55">
              Se cobra {formatCop(plan.priceCop)} COP vía Wompi.
            </p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-brand-ink/85">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-success" strokeWidth={3} />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              to="/checkout/$planId"
              params={{ planId: plan.id }}
              className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-brand-ink text-sm font-semibold text-white transition hover:bg-brand-ink-soft"
            >
              Elegir plan
            </Link>
          </div>
        ))}
      </div>

      <p className="text-xs text-brand-ink/55">
        Después del pago te pediremos completar tus datos y escoger horario.
      </p>
    </div>
  );
}