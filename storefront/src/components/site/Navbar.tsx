import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Menu, X } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api/endpoints";
import { useSiteContent } from "@/lib/site-content";
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

      {open ? <MobileMenu onClose={() => setOpen(false)} isAuthenticated={isAuthenticated} miPortal={miPortal} waHref={waHref} /> : null}
    </header>
  );
}

const MENU_ITEMS = [...NAV, { label: "FAQ", href: "#faq" }];

/**
 * Menú móvil 2026 (diseño de Figma): takeover completo en crema — la página
 * "se voltea a su lado claro". Links gigantes numerados, puerta de Inicia
 * Sesión, zona de estudiantes hacia el dashboard, WhatsApp y footer.
 */
function MobileMenu({
  onClose,
  isAuthenticated,
  miPortal,
  waHref,
}: {
  onClose: () => void;
  isAuthenticated: boolean;
  miPortal: string;
  waHref: string;
}) {
  const { social } = useSiteContent();
  // Scroll-lock mientras el takeover está abierto.
  useEffect(() => {
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, []);

  const socials = [
    { label: "Instagram", href: social.instagram },
    { label: "Facebook", href: social.facebook },
  ].filter((s): s is { label: string; href: string } => !!s.href);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-brand-cream px-6 pb-8 lg:hidden">
      {/* Barra superior propia: logo tinta + cerrar */}
      <div className="flex items-center justify-between py-5">
        <Link to="/" onClick={onClose} className="text-brand-ink" aria-label="FreaknEnglish">
          <Logo className="h-8 w-auto" />
        </Link>
        <button
          onClick={onClose}
          className="rounded-xl border-[1.5px] border-brand-ink/35 p-2 text-brand-ink"
          aria-label="Cerrar menú"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Links gigantes numerados */}
      <nav className="mt-8 flex flex-col gap-7">
        {MENU_ITEMS.map((item, i) => (
          <a
            key={item.href}
            href={item.href}
            onClick={onClose}
            className="flex items-baseline gap-3"
          >
            <span className="text-[13px] font-semibold text-brand-ink/50">
              <span className="text-brand-yellow">(</span>0{i + 1}
              <span className="text-brand-yellow">)</span>
            </span>
            <span className="font-display text-[30px] font-extrabold uppercase leading-none text-brand-ink">
              {item.label}
            </span>
          </a>
        ))}
      </nav>

      {!isAuthenticated ? (
        <Link
          to="/login"
          onClick={onClose}
          className="mt-9 inline-flex w-fit items-center gap-2 rounded-full border-[1.5px] border-brand-ink/40 px-6 py-3 text-[15px] font-semibold text-brand-ink"
        >
          Inicia Sesión <ArrowRight className="size-4" />
        </Link>
      ) : null}

      <div className="mt-8 border-t border-brand-ink/15 pt-7">
        <span className="inline-block rounded-full bg-brand-yellow px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-ink">
          Zona Estudiantes
        </span>
        <Link
          to={isAuthenticated ? miPortal : "/login"}
          onClick={onClose}
          className="mt-3 flex items-center gap-2 font-display text-[24px] font-extrabold uppercase leading-none text-brand-ink"
        >
          Ir a mi Dashboard <ArrowRight className="size-5" />
        </Link>
        <p className="mt-2.5 max-w-[300px] text-[14px] leading-relaxed text-brand-ink/60">
          Confirma tus clases, avanza en tus módulos y revisa tu calendario.
        </p>
      </div>

      <div className="mt-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-ink/55">
          ¿Alguna duda?
        </p>
        <a
          href={waHref}
          target="_blank"
          rel="noreferrer"
          onClick={onClose}
          className="mt-2 inline-flex items-center gap-3 font-display text-[22px] font-bold text-brand-ink"
        >
          Escríbenos <ArrowRight className="size-5" />
          <span className="inline-flex items-center gap-1.5 text-[13px] font-sans font-semibold text-brand-ink/60">
            <WhatsAppIcon className="size-4 text-[#25D366]" /> WhatsApp
          </span>
        </a>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-brand-ink/15 pt-6 text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-ink/55">
        <span>© Freakn&apos; 2026</span>
        <span className="flex gap-3">
          {socials.length
            ? socials.map((s, i) => (
                <a key={s.label} href={s.href} target="_blank" rel="noreferrer" className="hover:text-brand-ink">
                  {s.label}
                  {i < socials.length - 1 ? " ·" : ""}
                </a>
              ))
            : "Instagram · Facebook"}
        </span>
      </div>
    </div>
  );
}
