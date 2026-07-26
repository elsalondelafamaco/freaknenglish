import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";

type Common = {
  children: ReactNode;
  className?: string;
  size?: "md" | "lg";
  withArrow?: boolean;
};

const sizes = {
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

// En claro es la píldora negra de la marca. En oscuro, un gris sobre fondo
// oscuro se lee como botón deshabilitado, así que el CTA principal pasa al
// amarillo de marca con texto oscuro: destaca y sigue siendo Freakn.
const base =
  "inline-flex items-center justify-center gap-2 rounded-full bg-brand-ink text-white font-semibold transition-all hover:bg-brand-ink-soft active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink focus-visible:ring-offset-2 " +
  "dark:bg-brand-yellow dark:text-brand-ink dark:hover:brightness-110";

export function DarkPillLink({
  to,
  children,
  className,
  size = "md",
  withArrow = true,
  ...rest
}: Common & { to: string } & Omit<ComponentProps<typeof Link>, "to" | "children" | "className">) {
  return (
    <Link to={to} className={cn(base, sizes[size], className)} {...(rest as any)}>
      <span>{children}</span>
      {withArrow ? <ArrowRight className="size-4" /> : null}
    </Link>
  );
}

export function DarkPillButton({
  children,
  className,
  size = "md",
  withArrow = true,
  ...rest
}: Common & ComponentProps<"button">) {
  return (
    <button className={cn(base, sizes[size], className)} {...rest}>
      <span>{children}</span>
      {withArrow ? <ArrowRight className="size-4" /> : null}
    </button>
  );
}