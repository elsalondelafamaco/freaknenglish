import type { ReactNode } from "react";
import { focusRing } from "@/components/app/AppUi";
import { cn } from "@/lib/utils";

/**
 * Piezas compartidas del portal del profe: las mismas reglas que el del
 * estudiante (crema, tinta, amarillo = ahora/atención) pero para pantallas de
 * trabajo: tablas densas y acciones por fila. En escritorio las acciones de fila
 * miden 36 px (los nombres de la persona van en el aria-label).
 */

/** Acción secundaria de fila (36 px). */
export const btnRow = `inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border-2 border-brand-ink bg-white px-3.5 text-[12px] font-bold text-brand-ink transition-colors hover:bg-brand-cream-soft hover:text-brand-ink disabled:pointer-events-none disabled:opacity-50 ${focusRing}`;

/** Acción principal de fila: relleno de tinta. */
export const btnRowInk = `inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border-2 border-brand-ink bg-brand-ink px-3.5 text-[12px] font-bold text-brand-cream hover:text-brand-cream disabled:pointer-events-none disabled:opacity-50 dark:text-white ${focusRing}`;

/** Fila de tabla: encabezado crema con línea de tinta, filas con divisor fino. */
export const th =
  "border-b-2 border-brand-ink bg-brand-cream-soft px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-brand-ink/70";
export const td = "border-t border-brand-ink/15 px-4 py-3 align-middle text-sm text-brand-ink";

/** Campo de texto del portal: borde tinta, 44 px. */
export const inputBase = `min-h-11 w-full border-2 border-brand-ink bg-white px-3 text-sm text-brand-ink placeholder:text-brand-ink/50 ${focusRing}`;

/** Pestaña/filtro tipo píldora: elegido = tinta (con visto), no elegido = blanco. */
export function pillClass(activo: boolean) {
  return cn(
    "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border-2 border-brand-ink px-4 text-[13px] font-bold transition-colors",
    activo
      ? "bg-brand-ink text-brand-cream hover:text-brand-cream dark:text-white"
      : "bg-white text-brand-ink hover:bg-brand-cream-soft hover:text-brand-ink",
    focusRing,
  );
}

/** Tres cifras en una caja: la del medio (atención) va en amarillo si `atencion`. */
export function CifrasCaja({
  items,
}: {
  items: Array<{ label: string; value: number | string; atencion?: boolean }>;
}) {
  return (
    <dl className="grid grid-cols-1 border-2 border-brand-ink bg-white sm:grid-cols-3">
      {items.map((it, i) => (
        <div
          key={it.label}
          className={cn(
            "px-4 py-3.5",
            i > 0 ? "border-t-2 border-brand-ink sm:border-l-2 sm:border-t-0" : "",
            it.atencion ? "bg-brand-yellow-soft" : "",
          )}
        >
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-ink/70">{it.label}</dt>
          <dd className="mt-1.5 font-display text-[30px] font-extrabold leading-none text-brand-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Tarjeta blanca de lo principal (sombra dura) con título de sección. */
export function Seccion({
  id,
  titulo,
  aside,
  children,
  principal = true,
  className,
}: {
  id: string;
  titulo: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  principal?: boolean;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn("min-w-0 border-2 border-brand-ink bg-white", principal ? "shadow-hard" : "", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 p-4">
        <h2 id={id} className="font-display text-[18px] font-extrabold uppercase leading-tight tracking-[-0.01em] text-brand-ink">
          {titulo}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
