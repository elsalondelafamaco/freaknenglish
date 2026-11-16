import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing, tag, tagNeutral } from "@/components/app/AppUi";

/**
 * Piezas propias del panel de administración. El admin trabaja con tablas y
 * formularios, así que NO grita: tarjetas planas con borde tinta, sombra dura
 * solo en lo principal, y amarillo únicamente para lo que pide atención.
 */

/** Etiqueta de estado con la marca: contorno tinta; relleno amarillo solo si pide atención. */
export function ChipEstado({
  atencion,
  children,
  className,
}: {
  atencion?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn(atencion ? tag : tagNeutral, className)}>{children}</span>;
}

/** Control segmentado: elegido = relleno tinta. Botones reales de 44 px. */
export function Segmentado<T extends string | number>({
  opciones,
  valor,
  onChange,
  etiqueta,
  className,
}: {
  opciones: ReadonlyArray<{ valor: T; texto: ReactNode; aria?: string }>;
  valor: T;
  onChange: (v: T) => void;
  etiqueta: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={etiqueta} className={cn("inline-flex flex-wrap gap-1 border-2 border-brand-ink bg-white p-1", className)}>
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <button
            key={String(o.valor)}
            type="button"
            aria-pressed={activo}
            aria-label={o.aria}
            onClick={() => onChange(o.valor)}
            className={cn(
              "inline-flex min-h-9 items-center justify-center px-3.5 text-[13px] font-bold transition-colors",
              activo ? "bg-brand-ink text-brand-cream hover:text-brand-cream dark:text-white" : "text-brand-ink hover:bg-brand-cream-soft hover:text-brand-ink",
              focusRing,
            )}
          >
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Cifra del panel. Si `to` existe, toda la tarjeta es un enlace (una cifra que
 * señala un problema lleva a donde se arregla). `atencion` = amarillo.
 */
export function Kpi({
  etiqueta,
  valor,
  ayuda,
  atencion,
  to,
  icon,
}: {
  etiqueta: string;
  valor: string;
  ayuda?: string;
  atencion?: boolean;
  to?: string;
  icon?: ReactNode;
}) {
  const cuerpo = (
    <>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-ink/70">
        {icon} {etiqueta}
      </div>
      <div className="mt-2 font-display text-[30px] font-extrabold leading-none text-brand-ink">{valor}</div>
      {ayuda ? <div className="mt-1.5 text-xs text-brand-ink/70">{ayuda}</div> : null}
      {to ? (
        <div className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-brand-ink underline underline-offset-2">
          Ver <ArrowRight className="size-3" aria-hidden="true" />
        </div>
      ) : null}
    </>
  );
  const clase = cn("block border-2 border-brand-ink p-4", atencion ? "bg-brand-yellow-soft" : "bg-white");
  if (to) {
    return (
      <Link to={to as never} className={cn(clase, "transition-colors hover:bg-brand-cream-soft", focusRing)}>
        {cuerpo}
      </Link>
    );
  }
  return <div className={clase}>{cuerpo}</div>;
}

/** Etiqueta de campo de formulario del admin. */
export const labelCampo = "block text-xs font-bold text-brand-ink";
/** Línea de ayuda bajo un campo. */
export const ayudaCampo = "mt-1 text-xs text-brand-ink/70";
