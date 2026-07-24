import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api/endpoints";
import { Logo } from "./Logo";
import { DarkPillLink } from "./DarkPillButton";

const NAV = [
  { label: "¿Cómo Funciona?", href: "#como-funciona" },
  { label: "Casos De Éxito", href: "#testimonios" },
  { label: "Precios", href: "#precios" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { isAuthenticated, user } = useAuth();
  const firstName = user?.fullName.split(" ")[0];
  const contactQ = useQuery({ queryKey: ["contact"], queryFn: () => settingsApi.contact(), staleTime: 5 * 60_000 });
  const c = contactQ.data;
  const waHref = c ? `https://wa.me/${c.whatsappNumber}?text=${encodeURIComponent(c.whatsappMessage)}` : "https://wa.me/573000000000";
  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
        <Link to="/" className="flex items-center" aria-label="FreaknEnglish">
          <Logo className="h-7 w-auto md:h-8" />
        </Link>

        <nav className="hidden lg:flex items-center gap-8">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-[15px] font-medium text-brand-ink/80 hover:text-brand-ink transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-6">
          <span className="text-[13px] text-brand-ink/70">
            ¿Alguna Duda?{" "}
            <a href={waHref} target="_blank" rel="noreferrer" className="font-medium text-brand-ink hover:underline">
              Escríbenos
            </a>
          </span>
          {isAuthenticated ? (
            <DarkPillLink to="/app" size="md" withArrow>
              {firstName ? `Hola, ${firstName}` : "Mi cuenta"}
            </DarkPillLink>
          ) : (
            <DarkPillLink to="/login" size="md" withArrow>
              Inicia Sesión
            </DarkPillLink>
          )}
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="lg:hidden rounded-full p-2 -mr-2 text-brand-ink hover:bg-brand-ink/5"
          aria-label="Abrir menú"
        >
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {open ? (
        <div className="lg:hidden mx-4 rounded-3xl border border-brand-line bg-white p-5 shadow-soft">
          <div className="flex flex-col gap-4">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="text-base font-medium text-brand-ink"
              >
                {item.label}
              </a>
            ))}
            <hr className="border-brand-line" />
            {isAuthenticated ? (
              <DarkPillLink to="/app" className="w-full">
                Ir a mi cuenta
              </DarkPillLink>
            ) : (
              <DarkPillLink to="/login" className="w-full">
                Inicia Sesión
              </DarkPillLink>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}