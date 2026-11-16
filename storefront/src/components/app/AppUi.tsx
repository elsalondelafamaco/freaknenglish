import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { btnPrimary, btnSecondary, focusRing } from "@/components/site/AuthShell";
import { cn } from "@/lib/utils";
import { iniciales } from "@/lib/domain/clases-fecha";

/**
 * Piezas del portal del estudiante (y del cascarón compartido) para que las
 * pantallas se vean como el checkout: crema de fondo, títulos Bricolage con una
 * palabra marcada, tarjetas con borde tinta y sombra dura SOLO en lo principal.
 * Elegido = tinta; amarillo = ahora o atención.
 */

export { btnPrimary, btnSecondary, focusRing };

/** Botón principal que no se estira a todo el ancho en pantallas medianas. */
export const btnPrimaryAuto = `${btnPrimary} sm:w-auto`;
export const btnSecondaryAuto = `${btnSecondary} sm:w-auto`;

/** Botón de píldora chico (44 px de alto) para acciones secundarias dentro de filas. */
export const btnChip = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border-2 border-brand-ink bg-white px-4 text-[13px] font-bold text-brand-ink transition-colors hover:bg-brand-cream-soft hover:text-brand-ink disabled:pointer-events-none disabled:opacity-50 ${focusRing}`;

/** Igual, pero relleno de tinta: la acción que importa de la fila. */
export const btnChipInk = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border-2 border-brand-ink bg-brand-ink px-4 text-[13px] font-bold text-brand-cream hover:text-brand-cream disabled:pointer-events-none disabled:opacity-50 dark:text-white ${focusRing}`;

export const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-ink/70";
export const cardPrimary = "shadow-hard border-2 border-brand-ink bg-white";
export const cardPlain = "border-2 border-brand-ink bg-white";
/** Separador entre filas de una lista. */
export const rowLine = "border-t border-brand-ink/15";
/** Etiqueta chica: "Movida", "Hoy", "Cambio". Amarillo = atención. */
export const tag =
  "inline-flex items-center rounded-full border-[1.5px] border-brand-ink bg-brand-yellow-soft px-2.5 py-0.5 text-[11px] font-bold text-brand-ink";
/** Etiqueta neutra (sin atención). */
export const tagNeutral =
  "inline-flex items-center rounded-full border-[1.5px] border-brand-ink bg-white px-2.5 py-0.5 text-[11px] font-bold text-brand-ink";

/** Título de página con el resaltador en UNA palabra clave. */
export function Titulo({
  children,
  highlight,
  className,
}: {
  children: string;
  highlight?: string;
  className?: string;
}) {
  const i = highlight ? children.indexOf(highlight) : -1;
  return (
    <h1
      className={cn(
        "font-display text-[32px] font-extrabold uppercase leading-[1.02] tracking-[-0.02em] text-brand-ink md:text-[40px]",
        className,
      )}
    >
      {i < 0 ? (
        children
      ) : (
        <>
          {children.slice(0, i)}
          <span className="marker-highlight">{highlight}</span>
          {children.slice(i + highlight!.length)}
        </>
      )}
    </h1>
  );
}

export function PageHeader({
  eyebrowText,
  title,
  highlight,
  children,
  aside,
}: {
  eyebrowText?: ReactNode;
  title: string;
  highlight?: string;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrowText ? <p className={cn(eyebrow, "mb-1.5")}>{eyebrowText}</p> : null}
        <Titulo highlight={highlight}>{title}</Titulo>
        {children ? <div className="mt-3 max-w-xl text-[15px] text-brand-ink/80">{children}</div> : null}
      </div>
      {aside}
    </header>
  );
}

/** Subtítulo de sección: Bricolage en mayúsculas, sin resaltador (ese es del H1). */
export function SeccionTitulo({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <h2
      id={id}
      className={cn("font-display text-[18px] font-extrabold uppercase leading-tight tracking-[-0.01em] text-brand-ink", className)}
    >
      {children}
    </h2>
  );
}

/** Círculo con las iniciales de una persona. */
export function Avatar({ nombre, className }: { nombre?: string | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full border-2 border-brand-ink bg-white font-display text-[13px] font-extrabold text-brand-ink",
        className,
      )}
    >
      {iniciales(nombre)}
    </span>
  );
}

/** Estado de carga: bloques que respiran y un texto que los lectores de pantalla sí leen. */
export function Cargando({ children = "Cargando…" }: { children?: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className={cn(cardPlain, "p-5")}>
      <div className="h-4 w-40 animate-pulse rounded bg-brand-ink/10" />
      <div className="mt-3 h-4 w-64 max-w-full animate-pulse rounded bg-brand-ink/10" />
      <div className="mt-3 h-4 w-52 max-w-full animate-pulse rounded bg-brand-ink/10" />
      <span className="mt-4 block text-sm font-medium text-brand-ink/70">{children}</span>
    </div>
  );
}

/** Estado vacío: dice qué pasa y, si hay, qué hacer. */
export function Vacio({ titulo, children, accion }: { titulo?: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="border-2 border-dashed border-brand-ink/40 bg-white/60 p-6 text-center md:p-8">
      {titulo ? <p className="font-display text-[17px] font-extrabold uppercase text-brand-ink">{titulo}</p> : null}
      <p className={cn("mx-auto max-w-md text-sm text-brand-ink/80", titulo ? "mt-2" : "")}>{children}</p>
      {accion ? <div className="mt-4 flex justify-center">{accion}</div> : null}
    </div>
  );
}

/** Estado de error con salida: si hay `onRetry`, un botón para reintentar. */
export function EstadoError({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 border-2 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-800 sm:flex-row sm:items-center sm:justify-between"
    >
      <span>{children}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border-2 border-red-700 bg-white px-4 text-[13px] font-bold text-red-800 hover:bg-red-100 ${focusRing}`}
        >
          <RefreshCw className="size-3.5" /> Intentar de nuevo
        </button>
      ) : null}
    </div>
  );
}

/** Interruptor real: un botón con `role="switch"`. */
export function Interruptor({
  checked,
  onChange,
  labelledBy,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  labelledBy: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex min-h-11 min-w-14 shrink-0 items-center justify-end disabled:opacity-50 ${focusRing}`}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative block h-[26px] w-11 rounded-full border-2 border-brand-ink transition-colors",
          checked ? "bg-brand-ink" : "bg-white",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] size-[18px] rounded-full transition-all",
            checked ? "left-[20px] bg-brand-cream" : "left-[2px] bg-brand-ink",
          )}
        />
      </span>
    </button>
  );
}
