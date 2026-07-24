import { useSiteContent } from "@/lib/site-content";
import { Logo } from "./Logo";

const SERVICE_LINKS = [
  { label: "¿Cómo funciona?", href: "/#como-funciona" },
  { label: "Testimonios", href: "/#testimonios" },
  { label: "Precios", href: "/#precios" },
  { label: "Preguntas frecuentes", href: "/#faq" },
];

export function Footer() {
  // Legal (PDFs subidos por el admin) y redes vienen del contenido editable.
  const { legal, social } = useSiteContent();

  const legalLinks = [
    { label: "Política de privacidad", href: legal.privacy },
    { label: "Términos y condiciones", href: legal.terms },
  ].filter((l): l is { label: string; href: string } => !!l.href);

  const socialLinks = [
    { label: "Instagram", href: social.instagram },
    { label: "Facebook", href: social.facebook },
  ].filter((l): l is { label: string; href: string } => !!l.href);

  const cols = [
    { title: "Servicios", links: SERVICE_LINKS, external: false },
    // PDFs legales: pestaña aparte (el navegador los muestra inline, no descarga).
    { title: "Legal", links: legalLinks, external: true },
    { title: "Síguenos", links: socialLinks, external: true },
  ].filter((c) => c.links.length > 0);

  return (
    <footer className="bg-brand-ink text-white">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo className="h-14 w-auto" />
          </div>
          {cols.map((col) => (
            <div key={col.title}>
              <div className="text-sm font-semibold text-white/60">{col.title}</div>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      {...(col.external ? { target: "_blank", rel: "noreferrer" } : {})}
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
