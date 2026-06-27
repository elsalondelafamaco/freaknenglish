import { Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { PLANS, type Plan } from "@/lib/domain/plans";

export function Pricing() {
  return (
    <section id="precios" className="bg-brand-surface py-20 lg:py-28 scroll-mt-24">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="text-center">
          <p className="text-sm font-medium text-brand-ink/60">
            Planes que se adaptan a tus necesidades
          </p>
          <h2 className="mt-2 text-balance text-3xl font-bold leading-tight tracking-tight text-brand-ink sm:text-4xl lg:text-[44px]">
            Elige cuántos días a la Semana quieres avanzar
          </h2>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3 lg:items-center">
          {PLANS.map((p) => (
            <PriceCard key={p.id} plan={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PriceCard({ plan }: { plan: Plan }) {
  const highlight = plan.highlight;
  return (
    <div
      className={cn(
        "rounded-3xl p-1.5",
        highlight ? "bg-brand-yellow-soft" : "bg-brand-yellow-soft/60",
      )}
    >
      {plan.tag ? (
        <p className="px-5 pt-3 pb-2 text-center text-xs font-medium text-brand-ink/70">
          {plan.tag}
        </p>
      ) : (
        <div className="h-9" />
      )}
      <div className="rounded-[22px] bg-brand-yellow-soft px-6 pb-7 pt-6 text-center">
        <h3 className="text-2xl font-bold text-brand-ink">{plan.name}</h3>
        <div className="mt-2 text-3xl font-bold text-brand-ink">
          {plan.priceDisplay} <span className="text-base font-medium text-brand-ink/60">/ mes</span>
        </div>
        <Link
          to="/checkout/$planId"
          params={{ planId: plan.id }}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-brand-ink text-sm font-semibold text-white shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-ink-soft hover:shadow-lg active:scale-[0.98]"
        >
          Seleccionar Plan
        </Link>
        <ul className="mt-6 space-y-2.5 text-left">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-[14px] text-brand-ink/80">
              <Check className="mt-0.5 size-4 shrink-0 text-brand-success" strokeWidth={3} />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}