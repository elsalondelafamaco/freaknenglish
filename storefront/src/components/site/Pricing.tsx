import { Check, MessageCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { PLANS, copAcobrar, formatCop } from "@/lib/domain/plans";
import { plansApi } from "@/lib/api/endpoints";

// Fallback de venta si el backend no responde: nunca frenamos una compra.
const SALES_WHATSAPP = "573012646770";
const SALES_WHATSAPP_URL = `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(
  "¡Hola! Quiero información sobre los planes de FreaknEnglish 💛",
)}`;

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
  // Si el backend falla, NO mostramos precios posiblemente desactualizados:
  // la sección se convierte en un CTA directo a WhatsApp para no parar ventas.
  const { data, isError, isPending } = useQuery({
    queryKey: ["plans", "public"],
    queryFn: () => plansApi.list(),
    staleTime: 60_000,
    retry: 1,
  });
  const trm = data?.trm.valueCop ?? null;
  const plans: ApiPlan[] | null =
    data?.plans.map((p) => {
      const local = PLANS.find((l) => l.id === p.id);
      return {
        ...p,
        highlight: local?.highlight,
        tag: local?.tag,
        features: p.features?.length ? p.features : local?.features ?? [],
      };
    }) ?? null;

  if (isError || (data && !data.plans.length)) return <PricingWhatsAppFallback />;

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

        {/* Con 4+ planes activos la grilla pasa a 2×2 en lg y 4 columnas en xl. */}
        <div
          className={`mt-12 grid gap-6 lg:items-center ${
            (plans?.length ?? 3) > 3 ? "sm:grid-cols-2 xl:grid-cols-4" : "lg:grid-cols-3"
          }`}
        >
          {isPending || !plans
            ? [0, 1, 2].map((i) => <PriceCardSkeleton key={i} />)
            : plans.map((p) => <PriceCard key={p.id} plan={p} trm={trm} />)}
        </div>
      </div>
    </section>
  );
}

/** Skeleton mientras cargan los precios reales (evita mostrar precios viejos). */
function PriceCardSkeleton() {
  return (
    <div className="animate-pulse rounded-3xl bg-brand-yellow-soft/60 p-1.5">
      <div className="h-9" />
      <div className="rounded-[22px] bg-brand-yellow-soft px-6 pb-7 pt-6">
        <div className="mx-auto h-7 w-2/3 rounded-full bg-brand-ink/10" />
        <div className="mx-auto mt-3 h-9 w-1/2 rounded-full bg-brand-ink/10" />
        <div className="mt-5 h-11 w-full rounded-full bg-brand-ink/15" />
        <div className="mt-6 space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-4 w-full rounded-full bg-brand-ink/10" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Sección espejo de Pricing para cuando el backend no responde: misma
 * estética, pero el CTA lleva directo a WhatsApp para cerrar la venta.
 */
function PricingWhatsAppFallback() {
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

        <div className="mx-auto mt-12 max-w-2xl rounded-3xl bg-brand-yellow-soft p-1.5">
          <div className="rounded-[22px] bg-brand-yellow-soft px-8 pb-9 pt-8 text-center">
            <h3 className="text-2xl font-bold text-brand-ink">
              Cuéntanos tu meta y te armamos el plan perfecto
            </h3>
            <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-brand-ink/70">
              Escríbenos por WhatsApp y en minutos te compartimos los planes,
              precios y horarios disponibles. Sin esperas, con una persona real.
            </p>
            <a
              href={SALES_WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-ink px-8 text-sm font-semibold text-white shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-ink-soft hover:shadow-lg active:scale-[0.98]"
            >
              <MessageCircle className="size-4" /> Hablar por WhatsApp
            </a>
            <ul className="mx-auto mt-7 max-w-sm space-y-2.5 text-left">
              {[
                "Clases 1 a 1 en vivo con profesor propio",
                "Planes de 3, 4 o 5 días a la semana",
                "Horarios fijos que se adaptan a tu rutina",
                "Respuesta inmediata por WhatsApp",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-[14px] text-brand-ink/80">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-success" strokeWidth={3} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function PriceCard({ plan, trm }: { plan: ApiPlan; trm: number | null }) {
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
          {/* Mismo cálculo que el checkout y que el cobro real: USD × TRM.
              Antes se pintaba el priceCop guardado, que estaba viejo y no
              cuadraba ni con la TRM de arriba ni con lo que salía al pagar. */}
          Se cobra {formatCop(copAcobrar(plan, trm))} COP.
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