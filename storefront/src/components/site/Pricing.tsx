import { MessageCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { PLANS, copAcobrar, formatCop } from "@/lib/domain/plans";
import { plansApi } from "@/lib/api/endpoints";
import { Reveal } from "./anim";

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

function SectionHeader({ trm }: { trm?: number | null }) {
  return (
    <Reveal>
      <div className="h-px w-full bg-brand-ink/25" />
      <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-ink/60">
            <span className="text-brand-yellow">(</span>03 — Planes que se adaptan a tus
            necesidades<span className="text-brand-yellow">)</span>
          </p>
          <h2 className="mt-5 font-display text-4xl font-extrabold uppercase leading-[1.02] tracking-[-0.02em] text-brand-ink sm:text-5xl lg:text-[68px]">
            Elige cuántos días a la
            <br className="hidden lg:block" /> Semana quieres avanzar.
          </h2>
        </div>
        <p className="max-w-[320px] text-[15px] leading-relaxed text-brand-ink/70">
          Precios en USD; se cobra el equivalente en COP
          {trm ? (
            <> con TRM de referencia de {formatCop(Math.round(trm))} (Superfinanciera)</>
          ) : (
            <> con TRM de referencia (Superfinanciera)</>
          )}
          . Sin cláusulas de permanencia.
        </p>
      </div>
    </Reveal>
  );
}

/**
 * Precios 2026: el USD manda (es el precio de venta real; el COP con TRM del
 * día es lo que sale en el cobro — misma regla que checkout.service.ts).
 * El plan destacado se eleva y carga la DNA de sombra dura.
 */
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
    <section id="precios" className="scroll-mt-24 bg-white py-16 lg:py-24">
      <div className="mx-auto max-w-[1440px] px-5 lg:px-16">
        <SectionHeader trm={trm} />
        <div
          className={cn(
            "mt-14 grid gap-8 lg:items-start lg:gap-10",
            (plans?.length ?? 3) > 3 ? "sm:grid-cols-2 xl:grid-cols-4" : "lg:grid-cols-3",
          )}
        >
          {isPending || !plans
            ? [0, 1, 2].map((i) => <PriceCardSkeleton key={i} />)
            : plans.map((p, i) => <PriceCard key={p.id} plan={p} trm={trm} index={i} />)}
        </div>
      </div>
    </section>
  );
}

/** Skeleton mientras cargan los precios reales (evita mostrar precios viejos). */
function PriceCardSkeleton() {
  return (
    <div className="animate-pulse border-2 border-brand-ink/15 bg-brand-cream p-8">
      <div className="h-9 w-2/3 rounded-full bg-brand-ink/10" />
      <div className="mt-6 h-px w-full bg-brand-ink/10" />
      <div className="mt-6 h-12 w-1/2 rounded-full bg-brand-ink/10" />
      <div className="mt-8 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-4 w-full rounded-full bg-brand-ink/10" />
        ))}
      </div>
      <div className="mt-8 h-12 w-full rounded-full bg-brand-ink/15" />
    </div>
  );
}

/**
 * Sección espejo de Pricing para cuando el backend no responde: misma
 * estética, pero el CTA lleva directo a WhatsApp para cerrar la venta.
 */
function PricingWhatsAppFallback() {
  return (
    <section id="precios" className="scroll-mt-24 bg-white py-16 lg:py-24">
      <div className="mx-auto max-w-[1440px] px-5 lg:px-16">
        <SectionHeader />
        <Reveal delay={120}>
          <div className="shadow-hard mx-auto mt-14 max-w-2xl border-2 border-brand-ink bg-brand-cream p-10 text-center [--hard-color:var(--brand-ink)]">
            <h3 className="font-display text-3xl font-bold text-brand-ink">
              Escríbenos a WhatsApp si tienes preguntas
            </h3>
            <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-brand-ink/70">
              En minutos te compartimos los planes, precios y horarios disponibles.
              Sin esperas, con una persona real.
            </p>
            <a
              href={SALES_WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="shadow-hard press-hard mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-brand-ink px-9 py-4 font-display text-[15px] font-bold uppercase text-brand-cream"
            >
              <MessageCircle className="size-4" /> Hablar por WhatsApp
            </a>
            <ul className="mx-auto mt-8 max-w-sm space-y-2.5 text-left">
              {[
                "Clases 1 a 1 en vivo con profesor propio",
                "Planes de 3, 4 o 5 días a la semana",
                "Horarios fijos que se adaptan a tu rutina",
                "Respuesta inmediata por WhatsApp",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[14px] text-brand-ink/80">
                  <span className="mt-0.5 text-[12px] text-brand-yellow">✦</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function PriceCard({ plan, trm, index }: { plan: ApiPlan; trm: number | null; index: number }) {
  const featured = !!plan.highlight;
  return (
    <Reveal delay={index * 120}>
      <div
        className={cn(
          "border-2 border-brand-ink p-8 transition-transform duration-300",
          featured
            ? "shadow-hard relative bg-brand-ink text-brand-cream [--hard-x:10px] lg:-translate-y-6"
            : "bg-brand-cream text-brand-ink lg:mt-0 hover:-translate-y-1.5",
        )}
      >
        {featured ? (
          <span className="shadow-hard absolute -top-4 right-6 -rotate-3 border-2 border-brand-ink bg-brand-yellow px-4 py-1.5 font-display text-[12px] font-bold uppercase tracking-[0.06em] text-brand-ink [--hard-x:4px] [--hard-color:var(--brand-ink)]">
            El más popular
          </span>
        ) : null}

        <div className="font-display text-[36px] font-extrabold uppercase leading-none">
          {plan.daysPerWeek} Días{" "}
          <span className={cn("text-[16px] font-bold", featured ? "text-brand-cream/55" : "text-brand-ink/55")}>
            / Semana
          </span>
        </div>
        {plan.tag ? (
          <p className={cn("mt-1.5 text-[13px] italic", featured ? "text-brand-cream/60" : "text-brand-ink/60")}>
            {plan.tag}
          </p>
        ) : null}

        <div className={cn("my-6 h-px w-full", featured ? "bg-brand-cream/25" : "bg-brand-ink/25")} />

        {/* USD manda; el COP real (USD × TRM, igual que el checkout) va debajo */}
        <div className="font-display text-[52px] font-extrabold leading-none">
          {plan.priceUsd ? (
            <>
              ${plan.priceUsd}{" "}
              <span className={cn("text-[20px]", featured ? "text-white" : "text-brand-ink")}>USD</span>
            </>
          ) : (
            formatCop(plan.priceCop)
          )}
        </div>
        <div
          className={cn(
            "mt-1.5 text-[12px] font-semibold uppercase tracking-[0.14em]",
            featured ? "text-brand-cream/55" : "text-brand-ink/55",
          )}
        >
          / mes
        </div>

        <ul className="mt-7 space-y-3">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-[14px]">
              <span className="mt-0.5 text-[12px] text-brand-yellow">✦</span>
              <span className={featured ? "text-brand-cream/85" : "text-brand-ink/85"}>{f}</span>
            </li>
          ))}
        </ul>

        <Link
          to="/checkout/$planId"
          params={{ planId: plan.id }}
          className={cn(
            "press-hard mt-8 inline-flex w-full items-center justify-center rounded-full py-4 font-display text-[15px] font-bold uppercase tracking-[0.04em]",
            featured
              ? "shadow-hard bg-brand-yellow text-brand-ink [--hard-x:5px] [--hard-color:white]"
              : "shadow-hard bg-brand-ink text-brand-cream [--hard-x:5px]",
          )}
        >
          Seleccionar Plan →
        </Link>

        <p className={cn("mt-4 text-center text-[12px]", featured ? "text-brand-cream/50" : "text-brand-ink/50")}>
          {/* Mismo cálculo que el checkout y que el cobro real: USD × TRM. */}
          Se cobra {formatCop(copAcobrar(plan, trm))} COP
        </p>
      </div>
    </Reveal>
  );
}
