import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Reveal } from "./anim";
import { TickerBand } from "./TickerBand";

/**
 * CTA final 2026: la única sección inundada de amarillo en toda la página —
 * el acento se vuelve escenario justo antes del cierre. La cinta ✦ tinta
 * de abajo es la costura hacia el footer.
 */
export function CtaFinal() {
  return (
    <>
      <section className="bg-brand-yellow py-20 lg:py-28">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center px-5 text-center lg:px-16">
          <Reveal>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-ink">
              Empieza Hoy
            </p>
          </Reveal>
          <Reveal delay={120}>
            <h2 className="mt-7 font-display text-[38px] font-extrabold uppercase leading-[0.96] tracking-[-0.02em] text-brand-ink sm:text-7xl lg:text-[108px]">
              Deja de traducir.
              <br />
              Empieza a{" "}
              <span className="text-white [text-shadow:5px_5px_0_var(--brand-ink)]">hablar.</span>
            </h2>
          </Reveal>
          <Reveal delay={240}>
            <Link
              to="/checkout"
              className="press-hard mt-12 inline-flex items-center gap-2.5 whitespace-nowrap rounded-full bg-brand-ink px-7 py-4 font-display text-[14px] font-bold uppercase tracking-[0.03em] text-brand-yellow shadow-hard [--hard-x:7px] [--hard-color:white] lg:gap-3 lg:px-12 lg:py-6 lg:text-[20px]"
            >
              Comienza Hoy Tu Aprendizaje
              <ArrowRight className="size-5" />
            </Link>
          </Reveal>
          <Reveal delay={340}>
            <p className="mt-6 text-[14px] font-medium text-brand-ink/70">
              Sin cláusulas de permanencia · Tú decides cuándo parar
            </p>
          </Reveal>
        </div>
      </section>
      <TickerBand
        variant="ink"
        phrases={["Freakn' English", "Habla desde el día 1", "Real English. Real Results."]}
      />
    </>
  );
}
