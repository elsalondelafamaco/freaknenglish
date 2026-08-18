import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Menu, X } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api/endpoints";
import { Logo } from "./Logo";
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
 * Nav de la landing 2026: links en la tipografía display del botón (Bricolage
 * bold, mayúsculas) con índice amarillo, y la puerta de estudiantes como
 * bloque de dos líneas ("¿Ya eres estudiante?" + "Inicia Sesión →"). Vive
 * sobre la foto del hero y se compacta con fondo tinta al hacer scroll.
 * Sin ThemeToggle aquí: se perdía sobre la foto (sigue en el portal).
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

        {/* Links en la tipografía del botón (display bold) con índice amarillo */}
        <nav className="hidden items-center gap-10 lg:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="group relative font-display text-[14px] font-bold uppercase tracking-[0.05em] text-brand-cream/90 transition-colors hover:text-white"
            >
              {item.label}
              {/* subrayado amarillo que entra de izquierda a derecha */}
              <span className="absolute -bottom-1.5 left-0 h-0.5 w-0 bg-brand-yellow transition-all duration-200 group-hover:w-full" />
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-7 lg:flex">
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/70 transition-colors hover:text-white"
          >
            <WhatsAppIcon className="size-3.5 text-[#25D366]" />
            Escríbenos
          </a>
          {/* Puerta de estudiantes: pregunta arriba, acción abajo */}
          <Link
            to={isAuthenticated ? miPortal : "/login"}
            className="group block text-right"
          >
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55 transition-colors group-hover:text-white/75">
              {isAuthenticated ? "Tu cuenta" : "¿Ya eres estudiante?"}
            </span>
            <span className="mt-0.5 inline-flex items-center gap-1.5 font-display text-[16px] font-bold uppercase tracking-[0.02em] text-brand-cream">
              <span className="border-b-2 border-brand-yellow pb-px transition-colors group-hover:border-white group-hover:text-white">
                {isAuthenticated ? (firstName ? `Hola, ${firstName}` : "Mi cuenta") : "Inicia Sesión"}
              </span>
              <ArrowRight className="size-4 text-brand-yellow transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          </Link>
        </div>

        <div className="-mr-2 flex items-center lg:hidden">
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
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="font-display text-xl font-extrabold uppercase text-brand-ink"
              >
                {item.label}
              </a>
            ))}
            <hr className="border-brand-ink/15" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-ink/55">
                {isAuthenticated ? "Tu cuenta" : "¿Ya eres estudiante?"}
              </p>
              <Link
                to={isAuthenticated ? miPortal : "/login"}
                onClick={() => setOpen(false)}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-ink py-3 font-display font-bold uppercase text-brand-cream"
              >
                {isAuthenticated ? "Ir a mi cuenta" : "Inicia Sesión"}
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
