import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Menu, X } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api/endpoints";
import { Logo } from "./Logo";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { WhatsAppIcon } from "./WhatsAppIcon";
import { homePathFor } from "@/lib/roles";
import { useScrolled } from "./anim";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "¿Cómo Funciona?", href: "#como-funciona" },
  { label: "Casos De Éxito", href: "#testimonios" },
  { label: "Precios", href: "#precios" },
];

/**
 * Nav de la landing 2026: vive SOBRE la foto oscura del hero (texto claro,
 * hairline sutil) y al hacer scroll se compacta con fondo tinta. La "puerta"
 * de estudiantes (Inicia Sesión / Hola, {nombre}) mantiene posición y forma
 * en ambos estados para que los que entran a diario nunca la busquen.
 */
export function Navbar() {
  const [open, setOpen] = useState(false);
  const { isAuthenticated, user } = useAuth();
  const firstName = user?.fullName.split(" ")[0];
  // Cada rol a su portal: mandar a todos a /app dejaba al profe en el
  // dashboard del estudiante, con el cartel de "aún no tienes un plan".
  const miPortal = homePathFor(user?.roles);
  const contactQ = useQuery({ queryKey: ["contact"], queryFn: () => settingsApi.contact(), staleTime: 5 * 60_000 });
  const c = contactQ.data;
  const waHref = c ? `https://wa.me/${c.whatsappNumber}?text=${encodeURIComponent(c.whatsappMessage)}` : "https://wa.me/573000000000";
  const scrolled = useScrolled(90);

  const authPill = (
    <Link
      to={isAuthenticated ? miPortal : "/login"}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border-[1.5px] font-semibold transition-all duration-200",
        scrolled ? "px-5 py-2 text-[14px]" : "px-5 py-2.5 text-[15px]",
        "border-white/40 text-white hover:border-brand-yellow hover:text-brand-yellow",
      )}
    >
      <span>{isAuthenticated ? (firstName ? `Hola, ${firstName}` : "Mi cuenta") : "Inicia Sesión"}</span>
      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
    </Link>
  );

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-all duration-300",
        scrolled
          ? "bg-brand-ink/95 shadow-[0_1px_0_0] shadow-brand-yellow/25 backdrop-blur-sm"
          : "bg-transparent shadow-[0_1px_0_0] shadow-white/10",
      )}
    >
      <div
        className={cn(
          "mx-auto flex max-w-[1440px] items-center justify-between px-5 transition-all duration-300 lg:px-16",
          scrolled ? "py-3" : "py-5",
        )}
      >
        <Link to="/" className="flex items-center text-white" aria-label="FreaknEnglish">
          <Logo className={cn("w-auto transition-all duration-300", scrolled ? "h-7" : "h-8 md:h-9")} />
        </Link>

        <nav className="hidden items-center gap-9 lg:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="group relative text-[15px] font-semibold text-white/85 transition-colors hover:text-white"
            >
              {item.label}
              {/* subrayado amarillo que entra de izquierda a derecha */}
              <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-brand-yellow transition-all duration-200 group-hover:w-full" />
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/75 transition-colors hover:text-white"
          >
            <WhatsAppIcon className="size-3.5 text-[#25D366]" />
            ¿Dudas? Escríbenos
          </a>
          <ThemeToggle className="border-white/25 bg-transparent text-white" />
          {authPill}
        </div>

        <div className="-mr-2 flex items-center gap-1 lg:hidden">
          <ThemeToggle className="border-0 bg-transparent text-white" />
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-xl border-[1.5px] border-white/40 p-2 text-white hover:border-brand-yellow"
            aria-label="Abrir menú"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="mx-4 border-2 border-brand-ink bg-brand-cream p-5 shadow-hard lg:hidden">
          <div className="flex flex-col gap-4">
            {NAV.map((item, i) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-baseline gap-3 font-display text-xl font-extrabold uppercase text-brand-ink"
              >
                <span className="text-xs font-semibold text-brand-ink/50">
                  <span className="text-brand-yellow">(</span>0{i + 1}
                  <span className="text-brand-yellow">)</span>
                </span>
                {item.label}
              </a>
            ))}
            <hr className="border-brand-ink/15" />
            <Link
              to={isAuthenticated ? miPortal : "/login"}
              onClick={() => setOpen(false)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-ink py-3 font-semibold text-brand-cream"
            >
              {isAuthenticated ? "Ir a mi cuenta" : "Inicia Sesión"}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
