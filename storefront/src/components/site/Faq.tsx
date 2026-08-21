import { useState } from "react";
import { cn } from "@/lib/utils";
import { useSiteContent } from "@/lib/site-content";
import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api/endpoints";
import { WhatsAppIcon } from "./WhatsAppIcon";
import { Reveal } from "./anim";

/**
 * FAQ 2026: columna izquierda fija (título + puerta a WhatsApp) y acordeón
 * numerado a la derecha. El item abierto se "presiona hacia afuera" como slab
 * blanco con sombra dura — el affordance ES el lenguaje de sombras del logo.
 */
export function Faq() {
  // Editable desde /admin/site; con la API caída usa defaults quemados.
  const { faqs } = useSiteContent();
  const contactQ = useQuery({ queryKey: ["contact"], queryFn: () => settingsApi.contact(), staleTime: 5 * 60_000 });
  const c = contactQ.data;
  const waHref = c ? `https://wa.me/${c.whatsappNumber}?text=${encodeURIComponent(c.whatsappMessage)}` : "https://wa.me/573000000000";

  return (
    <section id="faq" className="scroll-mt-24 bg-brand-cream py-16 lg:py-24">
      <div className="mx-auto max-w-[1440px] px-5 lg:grid lg:grid-cols-[440px_1fr] lg:gap-20 lg:px-16">
        <Reveal>
          <div className="h-px w-full bg-brand-ink/25 lg:hidden" />
          <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-ink/60 lg:mt-0">
            Preguntas Frecuentes
          </p>
          <h2 className="mt-5 font-display text-4xl font-extrabold uppercase leading-[1.0] tracking-[-0.02em] text-brand-ink sm:text-5xl lg:text-[56px]">
            Si tienes
            <br className="hidden lg:block" /> preguntas,
            <br className="hidden lg:block" /> tenemos{" "}
            <span className="marker-highlight">respuestas.</span>
          </h2>
          <p className="mt-5 max-w-[340px] text-[15px] leading-relaxed text-brand-ink/70">
            Todo lo que necesitas saber sobre FreaknEnglish y cómo entregamos resultados.
          </p>
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex items-center gap-2 text-[15px] font-semibold text-brand-ink underline decoration-brand-yellow decoration-2 underline-offset-4 transition-colors hover:decoration-brand-ink"
          >
            <WhatsAppIcon className="size-4 text-[#25D366]" />
            ¿Alguna duda? Escríbenos →
          </a>
        </Reveal>

        <div className="mt-10 flex flex-col lg:mt-0">
          <div className="h-px w-full bg-brand-ink/25" />
          {faqs.map((f, i) => (
            <FaqItem key={f.q} {...f} defaultOpen={i === 0} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqItem({
  q,
  a,
  defaultOpen,
  index,
}: {
  q: string;
  a: string;
  defaultOpen?: boolean;
  index: number;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div
      className={cn(
        "transition-all duration-300",
        open
          ? "shadow-hard my-4 border-2 border-brand-ink bg-white px-7 py-6 lg:-mx-8"
          : "border-b border-brand-ink/20 px-1 py-0",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-4 py-5 text-left"
        aria-expanded={open}
      >
        <span className="flex items-baseline gap-4">
          <span className="shrink-0 text-[13px] font-semibold text-brand-ink/50">
            <span className="text-brand-yellow">(</span>0{index + 1}
            <span className="text-brand-yellow">)</span>
          </span>
          <span className="font-display text-[18px] font-bold uppercase leading-snug text-brand-ink lg:text-[20px]">
            {q}
          </span>
        </span>
        {/* + gira a ✕ (45°) al abrir; amarillo cuando está activo */}
        <span
          className={cn(
            "shrink-0 font-display text-[26px] font-extrabold leading-none transition-transform duration-300",
            open ? "rotate-45 text-brand-yellow [text-shadow:1.5px_1.5px_0_var(--brand-ink)]" : "text-brand-ink",
          )}
        >
          +
        </span>
      </button>
      {/* Altura animada sin medir: truco de grid-template-rows 0fr → 1fr */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <p className="max-w-[560px] pb-4 pl-10 text-[14px] leading-relaxed text-brand-ink/75 lg:text-[15px]">
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}
