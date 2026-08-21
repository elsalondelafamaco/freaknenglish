import { useEffect, useState } from "react";
import { Logo } from "./Logo";

/**
 * Preloader de marca (~1.9s): telón tinta donde el wordmark sube desde una
 * máscara (blanco + sombra amarilla), rotan dos palabras estilo split-flap
 * y crece la barra de progreso; sale con doble cortina (amarilla + tinta).
 * Vive en el SSR para que nunca haya flash de contenido sin vestir, y el
 * bloque global de prefers-reduced-motion lo vuelve instantáneo.
 */
export function Preloader() {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // Bloquea el scroll mientras el telón está puesto.
    document.documentElement.style.overflow = "hidden";
    const t = setTimeout(() => {
      setGone(true);
      document.documentElement.style.overflow = "";
    }, 1950);
    return () => {
      clearTimeout(t);
      document.documentElement.style.overflow = "";
    };
  }, []);

  if (gone) return null;

  return (
    <div
      aria-hidden
      className="animate-preloader-wipe fixed inset-0 z-[100] overflow-hidden bg-brand-ink"
    >
      <div className="flex h-full flex-col items-center justify-center">
        {/* Wordmark enmascarado: sube y se asienta */}
        <div className="overflow-hidden px-2 pb-2">
          <div className="animate-preloader-logo text-white">
            <Logo className="h-16 w-auto sm:h-20" />
          </div>
        </div>

        {/* Split-flap: REAL ENGLISH. → REAL RESULTS. */}
        <div className="mt-6 h-[18px] overflow-hidden text-center">
          <div className="animate-preloader-words">
            <p className="h-[18px] text-[12px] font-semibold uppercase tracking-[0.3em] text-brand-cream/70">
              Real English.
            </p>
            <p className="h-[18px] text-[12px] font-semibold uppercase tracking-[0.3em] text-brand-yellow">
              Real Results.
            </p>
          </div>
        </div>

        <div className="mt-7 h-[3px] w-44 overflow-hidden bg-white/15">
          <div className="animate-preloader-bar h-full bg-brand-yellow" />
        </div>
      </div>

      {/* Cortina amarilla que barre justo antes del wipe del telón */}
      <div className="animate-preloader-curtain absolute inset-0 bg-brand-yellow" />
    </div>
  );
}
