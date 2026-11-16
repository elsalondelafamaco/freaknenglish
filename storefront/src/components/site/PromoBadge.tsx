import { cn } from "@/lib/utils";
import { formatCop } from "@/lib/domain/plans";
import { formatUsd, textoBadge, type PrecioPromo, type PromoPublica } from "@/lib/domain/promos";

/** Insignia con los colores que eligió el admin para la promo. */
export function PromoBadge({ promo, className }: { promo: PromoPublica; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-[0.06em]",
        className,
      )}
      style={{ backgroundColor: promo.bgColor, color: promo.textColor }}
    >
      {textoBadge(promo)}
    </span>
  );
}

/**
 * Precio de lista y precio con descuento en la misma unidad: en USD si el
 * descuento deja un USD claro, y en COP si no (descuentos en pesos).
 */
export function preciosParaMostrar(precio: PrecioPromo): { tachado: string; final: string; enUsd: boolean } {
  const enUsd = precio.finalUsd !== null && precio.listaUsd !== null;
  return enUsd
    ? { tachado: `${formatUsd(precio.listaUsd as number)} USD`, final: formatUsd(precio.finalUsd as number), enUsd }
    : { tachado: formatCop(precio.listaCop), final: formatCop(precio.finalCop), enUsd };
}
