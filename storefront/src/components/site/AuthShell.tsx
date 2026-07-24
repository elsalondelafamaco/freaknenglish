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
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
        <path
          fill="#EA4335"
          d="M12 11v2.6h6.84c-.28 1.48-1.74 4.34-6.84 4.34A6.94 6.94 0 1 1 12 5.06c1.94 0 3.24.83 3.99 1.53l2.71-2.62A10.94 10.94 0 0 0 12 1a11 11 0 1 0 0 22c6.35 0 10.57-4.46 10.57-10.74 0-.72-.08-1.27-.18-1.82H12Z"
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