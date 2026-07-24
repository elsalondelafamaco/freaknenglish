import { Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { PLANS, formatCop } from "@/lib/domain/plans";
import { plansApi } from "@/lib/api/endpoints";

type ApiPlan = {
  id: string;
  name: string;
  daysPerWeek: number;
  priceCop: number;
  priceUsd: number | null;
  features: string[];
  highlight?: boolean;
  tag?: string;
};

export function Pricing() {
  // Fuente de verdad: backend (`GET /api/v1/plans`) que incluye TRM.
  // Si el backend no responde (SSR / offline), cae al catálogo local.
  const { data } = useQuery({
    queryKey: ["plans", "public"],
    queryFn: () => plansApi.list(),
    staleTime: 60_000,
  });
  const trm = data?.trm.valueCop ?? null;
  const plans: ApiPlan[] =
    data?.plans.map((p) => {
      const local = PLANS.find((l) => l.id === p.id);
      return {
        ...p,
        highlight: local?.highlight,
        tag: local?.tag,
        features: p.features?.length ? p.features : local?.features ?? [],
      };
    }) ??
    PLANS.map((p) => ({
      id: p.id,
      name: p.name,
      daysPerWeek: p.daysPerWeek,
      priceCop: p.priceCop,
      priceUsd: null,
      features: p.features,
      highlight: p.highlight,
      tag: p.tag,
    }));

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
          {trm ? (
            <p className="mt-3 text-xs text-brand-ink/50">
              TRM referencia: {formatCop(Math.round(trm))} COP / USD (Superfinanciera).
            </p>
          ) : null}
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3 lg:items-center">
          {plans.map((p) => (
            <PriceCard key={p.id} plan={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PriceCard({ plan }: { plan: ApiPlan }) {
  const highlight = plan.highlight;
  const priceLabel = plan.priceUsd ? `$${plan.priceUsd}` : formatCop(plan.priceCop);
  const unitLabel = plan.priceUsd ? "USD" : "COP";
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
          {priceLabel}{" "}
          <span className="text-base font-medium text-brand-ink/60">{unitLabel} / mes</span>
        </div>
        <p className="mt-1 text-xs text-brand-ink/55">
          Se cobra {formatCop(plan.priceCop)} COP vía Wompi.
        </p>
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