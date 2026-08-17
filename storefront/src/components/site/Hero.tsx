import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useSiteContent } from "@/lib/site-content";
import { SiteImage } from "./SiteImage";
import { Marquee, Reveal } from "./anim";
import { TESTIMONIAL_ITEMS } from "./Testimonials";

const TICKER = [
  "CLASES 1 A 1 EN VIVO",
  "PROFESORES REALES",
  "HABLA DESDE EL DÍA 1",
  "FEEDBACK PERSONALIZADO",
  "CONVERSACIONES PRÁCTICAS",
];

/**
 * Hero 2026: foto full-bleed (slot `hero-image` del admin) tratada como
 * escenario oscuro, titular display alineado a la derecha y un rotador de
 * testimonios reales abajo a la izquierda. El nav fijo vive encima.
 */
export function Hero() {
  return (
    <section className="relative flex min-h-[720px] flex-col overflow-hidden bg-brand-ink lg:h-[100svh] lg:max-h-[1000px]">
      {/* Fondo: foto + tratamientos de legibilidad (scrim, gradientes, calidez) */}
      <div className="absolute inset-0">
        <SiteImage
          slot="hero-image"
          alt=""
          loading="eager"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-brand-yellow/5 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-black/35" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-transparent [background-size:100%_30%] bg-no-repeat" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
      </div>

      {/* Copy — alineado a la derecha, estilo editorial */}
      <div className="relative mx-auto flex w-full max-w-[1440px] flex-1 flex-col items-center justify-center px-5 pt-28 text-center lg:items-end lg:px-16 lg:pt-24 lg:text-right">
        <Reveal delay={0}>
          <p className="flex items-center justify-center gap-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-cream lg:justify-end lg:text-[13px]">
            <span className="inline-block size-2 bg-brand-yellow" />
            Real English. Real Results.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <h1 className="mt-5 font-display text-[44px] font-extrabold uppercase leading-[0.96] tracking-[-0.03em] text-brand-cream sm:text-6xl lg:text-[96px]">
            Speak English with
            <br />
            Confidence, in <span className="text-brand-yellow">Real</span>
            <br />
            Conversations.
          </h1>
        </Reveal>

        <Reveal delay={240}>
          <p className="mx-auto mt-7 max-w-md text-[16px] leading-relaxed text-white/85 lg:mx-0 lg:max-w-[470px] lg:text-[19px]">
            Clases <strong className="font-semibold text-white">1 a 1 en Vivo</strong> con
            profesores reales, conversaciones prácticas y feedback personalizado para que
            hables inglés con fluidez.
          </p>
        </Reveal>

        <Reveal delay={360}>
          <Link
            to="/"
            hash="precios"
            className="shadow-hard press-hard mt-9 inline-flex items-center gap-3 rounded-[14px] bg-brand-cream px-9 py-5 font-display text-[17px] font-bold text-brand-ink lg:text-[18px]"
          >
            Comienza Hoy Tu Aprendizaje
            <ArrowRight className="size-5" />
          </Link>
        </Reveal>
      </div>

      {/* Fila inferior: rotador de testimonios + señal de scroll */}
      <div className="relative mx-auto flex w-full max-w-[1440px] items-end justify-between px-5 pb-20 pt-10 lg:px-16 lg:pb-24">
        <Reveal delay={500} className="max-w-[440px]">
          <TestimonialRotator />
        </Reveal>
        <div className="absolute bottom-20 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 lg:flex">
          <span className="text-[11px] font-semibold tracking-[0.2em] text-brand-cream/80">
            ( BAJA )
          </span>
          <span className="block h-9 w-px bg-brand-cream/50" />
          <span className="animate-cue block size-1.5 bg-brand-yellow" />
        </div>
      </div>

      {/* Ticker inferior */}
      <div className="relative border-t border-white/15">
        <Marquee speed={36} className="py-4">
          {TICKER.map((t) => (
            <span key={t} className="flex items-center">
              <span className="px-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-cream/85">
                {t}
              </span>
              <span className="text-[11px] text-brand-yellow">✦</span>
            </span>
          ))}
        </Marquee>
      </div>
    </section>
  );
}

/**
 * Rotador de frases reales de estudiantes (mismos items y overrides del admin
 * que la sección de testimonios). En código rota cada 5s con fade + slide.
 */
function TestimonialRotator() {
  const { testimonials } = useSiteContent();
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % TESTIMONIAL_ITEMS.length), 5000);
    return () => clearInterval(id);
  }, []);
  const item = TESTIMONIAL_ITEMS[i];
  const nombre = testimonials[item.imageSlot]?.name?.trim() || item.name;
  const rol = testimonials[item.imageSlot]?.role?.trim() || item.role;
  return (
    <div className="hidden flex-col gap-3 text-left lg:flex">
      <span className="text-[11px] tracking-[0.35em] text-brand-yellow">★★★★★</span>
      {/* key=i re-monta el bloque para disparar la animación de entrada */}
      <div key={i} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        <p className="max-w-[400px] text-[16px] italic leading-relaxed text-brand-cream">
          &ldquo;{item.quote}&rdquo;
        </p>
        <p className="mt-2.5 text-[13px] font-semibold text-white/75">
          {nombre} <span className="font-normal text-white/50">· {rol}</span>
        </p>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        {TESTIMONIAL_ITEMS.map((_, d) => (
          <span
            key={d}
            className={
              d === i
                ? "h-[3px] w-7 rounded-full bg-brand-yellow transition-all duration-300"
                : "h-[3px] w-3 rounded-full bg-white/35 transition-all duration-300"
            }
          />
        ))}
      </div>
    </div>
  );
}
