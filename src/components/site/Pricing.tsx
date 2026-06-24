import { Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

type Plan = {
  id: string;
  tag?: string;
  days: string;
  price: string;
  highlight?: boolean;
  features: string[];
};

const PLANS: Plan[] = [
  {
    id: "3-dias",
    tag: "Ideal si estás empezando",
    days: "3 días por Semana",
    price: "$155",
    features: [
      "Clases 1 a 1 en vivo",
      "Conversación desde el día 1",
      "Feedback personalizado",
      "Horarios fijos",
    ],
  },
  {
    id: "4-dias",
    days: "4 días por Semana",
    price: "$190",
    highlight: true,
    features: [
      "Clases 1 a 1 en vivo",
      "Conversación desde el día 1",
      "Feedback personalizado",
      "Horarios fijos",
    ],
  },
  {
    id: "5-dias",
    tag: "Para avanzar lo más rápido posible",
    days: "5 días por semana",
    price: "$225",
    features: [
      "Clases 1 a 1 en vivo",
      "Conversación desde el día 1",
      "Feedback personalizado",
      "Horarios fijos",
    ],
  },
];

export function Pricing() {
  return (
    <section id="precios" className="bg-brand-surface py-20 lg:py-28">
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
        <h3 className="text-2xl font-bold text-brand-ink">{plan.days}</h3>
        <div className="mt-2 text-3xl font-bold text-brand-ink">
          {plan.price} <span className="text-base font-medium text-brand-ink/60">/ mes</span>
        </div>
        <Link
          to="/checkout/$planId"
          params={{ planId: plan.id }}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-brand-ink text-sm font-semibold text-white transition hover:bg-brand-ink-soft"
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