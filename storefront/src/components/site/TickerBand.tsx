import { Marquee } from "./anim";

/**
 * Cinta ✦ de costura entre secciones (el "airlock" del sistema visual):
 * amarilla entrando al bloque oscuro de testimonios, tinta saliendo del CTA
 * final hacia el footer. Mismo componente, dos pieles.
 */
export function TickerBand({
  phrases,
  variant = "yellow",
}: {
  phrases: string[];
  variant?: "yellow" | "ink";
}) {
  const yellow = variant === "yellow";
  return (
    <div
      className={
        yellow
          ? "border-y-2 border-brand-ink bg-brand-yellow"
          : "border-y-2 border-brand-ink bg-brand-ink"
      }
    >
      <Marquee speed={28} className="py-[18px]">
        {phrases.map((t) => (
          <span key={t} className="flex items-center">
            <span
              className={
                "px-7 font-display text-[17px] font-bold uppercase tracking-[0.02em] " +
                (yellow ? "text-brand-ink" : "text-brand-cream")
              }
            >
              {t}
            </span>
            <span className={yellow ? "text-[15px] text-brand-ink" : "text-[15px] text-brand-yellow"}>
              ✦
            </span>
          </span>
        ))}
      </Marquee>
    </div>
  );
}
