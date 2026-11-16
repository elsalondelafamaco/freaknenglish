import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "./Logo";
import { navegadorEmbebido } from "@/lib/pago/wompi-navegador";

/**
 * Piezas visuales compartidas por login, registro, recuperación y checkout.
 * Las clases van como constantes para que botones, campos y foco se vean igual
 * en todas las pantallas por donde pasa quien compra.
 */

/** Foco visible: contorno tinta + halo amarillo. Solo con teclado (focus-visible). */
export const focusRing =
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-ink focus-visible:ring-[6px] focus-visible:ring-brand-yellow";

/** Botón principal: píldora tinta, texto crema en mayúsculas, sombra dura amarilla. */
export const btnPrimary = `shadow-hard press-hard inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-brand-ink px-6 font-display text-sm font-bold uppercase tracking-[0.04em] text-brand-cream [--hard-x:5px] hover:text-brand-cream disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none ${focusRing}`;

/** Botón secundario: píldora blanca con borde tinta, sin sombra. */
export const btnSecondary = `inline-flex h-[52px] w-full items-center justify-center gap-2.5 rounded-full border-2 border-brand-ink bg-white px-6 text-[15px] font-bold text-brand-ink transition-colors hover:bg-brand-cream-soft hover:text-brand-ink disabled:pointer-events-none disabled:opacity-50 ${focusRing}`;

/** Enlace de texto con área táctil de 44px. */
const linkBase = `inline-flex min-h-11 items-center font-bold text-brand-ink underline-offset-2 hover:text-brand-ink-soft ${focusRing}`;
export const linkTouch = `${linkBase} underline`;
/** Igual, pero sin subrayado hasta pasar el cursor (para "← Volver" y similares). */
export const linkPlain = `${linkBase} hover:underline`;

/** Texto de apoyo (gris cálido) que se sigue leyendo bien sobre crema y blanco. */
export const textoSuave = "text-brand-ink/70";

/** Marca una palabra del título con el marcador amarillo (solo una por H1). */
function TituloConMarca({ title, highlight }: { title: string; highlight?: string }) {
  if (!highlight) return <>{title}</>;
  const i = title.indexOf(highlight);
  if (i < 0) return <>{title}</>;
  return (
    <>
      {title.slice(0, i)}
      <span className="marker-highlight">{highlight}</span>
      {title.slice(i + highlight.length)}
    </>
  );
}

export function AuthShell({
  title,
  highlight,
  subtitle,
  footer,
  children,
}: {
  title: string;
  /** Palabra del título que lleva el marcador amarillo. */
  highlight?: string;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-brand-cream px-5 py-6 md:py-12">
      <div className="mx-auto flex max-w-md flex-col">
        <Link to="/" aria-label="Inicio" className={`inline-flex min-h-11 items-center self-start ${focusRing}`}>
          <Logo className="h-8 w-auto" />
        </Link>
        <h1 className="mt-8 font-display text-[34px] font-extrabold uppercase leading-[1.02] tracking-[-0.02em] text-brand-ink md:text-[42px]">
          <TituloConMarca title={title} highlight={highlight} />
        </h1>
        {subtitle ? <p className="mt-3 text-[15px] text-brand-ink/80">{subtitle}</p> : null}
        <div className="shadow-hard mt-6 border-2 border-brand-ink bg-white p-5 md:p-7">{children}</div>
        {footer ? <div className="mt-5 text-sm text-brand-ink/80">{footer}</div> : null}
      </div>
    </main>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1.5 block text-[13px] font-bold text-brand-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-brand-ink/70">{hint}</span> : null}
    </label>
  );
}

export const inputClass = `h-12 w-full rounded-xl border-[1.5px] border-brand-ink bg-white px-3.5 text-[15px] font-medium text-brand-ink placeholder:text-brand-ink/50 disabled:opacity-60 ${focusRing}`;

export function ErrorBox({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="rounded-xl border-2 border-red-700 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800"
    >
      {children}
    </div>
  );
}

export function GoogleButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  // Google no deja iniciar sesión desde el navegador interno de Instagram,
  // Facebook y similares: se avisa antes de que toque y se encuentre con el error.
  const [embebido, setEmbebido] = useState<string | null>(null);
  useEffect(() => {
    setEmbebido(navegadorEmbebido(navigator.userAgent));
  }, []);

  return (
    <div>
      <button type="button" onClick={onClick} disabled={disabled} className={btnSecondary}>
        {/* Logo "G" oficial multicolor de Google */}
        <svg viewBox="0 0 48 48" className="size-[18px] shrink-0" aria-hidden>
          <path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
          />
          <path
            fill="#FBBC05"
            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
          />
        </svg>
        {label}
      </button>
      {embebido ? (
        <p className="mt-2 text-xs text-brand-ink/80">
          Estás en el navegador de {embebido}: Google puede no dejarte entrar desde aquí. Si pasa,
          usa tu correo y contraseña o abre esta página en tu navegador.
        </p>
      ) : null}
    </div>
  );
}

export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-brand-ink/20" />
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-ink/70">{children}</span>
      <span className="h-px flex-1 bg-brand-ink/20" />
    </div>
  );
}
