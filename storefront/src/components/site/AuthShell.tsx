import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

export function AuthShell({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-brand-cream px-5 py-10 md:py-16">
      <div className="mx-auto flex max-w-md flex-col">
        <Link to="/" aria-label="Inicio" className="mb-8 self-start">
          <Logo className="h-8 w-auto" />
        </Link>
        <div className="rounded-3xl border border-brand-line bg-white p-7 shadow-soft md:p-9">
          <h1 className="text-2xl font-bold tracking-tight text-brand-ink md:text-3xl">{title}</h1>
          {subtitle ? (
            <p className="mt-2 text-sm text-brand-ink/65 md:text-[15px]">{subtitle}</p>
          ) : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="mt-5 text-center text-sm text-brand-ink/70">{footer}</div> : null}
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
      <span className="mb-1.5 block text-sm font-medium text-brand-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-brand-ink/60">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "h-11 w-full rounded-xl border border-brand-line bg-white px-3.5 text-[15px] text-brand-ink placeholder:text-brand-ink/35 outline-none transition focus:border-brand-ink focus:ring-2 focus:ring-brand-ink/10";

export function ErrorBox({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-brand-line bg-white text-sm font-medium text-brand-ink transition hover:bg-brand-cream/40 disabled:opacity-60"
    >
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
  );
}

export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-brand-line" />
      <span className="text-xs uppercase tracking-wider text-brand-ink/50">{children}</span>
      <span className="h-px flex-1 bg-brand-line" />
    </div>
  );
}