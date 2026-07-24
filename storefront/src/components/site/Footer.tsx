import { Logo } from "./Logo";

const COLS = [
  {
    title: "Servicios",
    links: [
      { label: "¿Cómo funciona?", href: "/#como-funciona" },
      { label: "Testimonios", href: "/#testimonios" },
      { label: "Precios", href: "/#precios" },
      { label: "Preguntas frecuentes", href: "/#faq" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Política de privacidad", href: "#" },
      { label: "Términos y condiciones", href: "#" },
    ],
  },
  {
    title: "Síguenos",
    links: [
      { label: "Instagram", href: "#" },
      { label: "Facebook", href: "#" },
      { label: "TikTok", href: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-brand-ink text-white">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo className="h-14 w-auto" />
          </div>
          {COLS.map((col) => (
            <div key={col.title}>
              <div className="text-sm font-semibold text-white/60">{col.title}</div>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="text-[15px] text-white transition-colors hover:text-brand-yellow"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t border-white/10 pt-6 text-xs text-white/50">
          Freakn - Todos los derechos reservados 2026®
        </div>
      </div>
    </footer>
  );
}