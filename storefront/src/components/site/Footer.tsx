import { useSiteContent } from "@/lib/site-content";
import { Logo } from "./Logo";
import { useParallax } from "./anim";

const SERVICE_LINKS = [
  { label: "¿Cómo funciona?", href: "/#como-funciona" },
  { label: "Testimonios", href: "/#testimonios" },
  { label: "Precios", href: "/#precios" },
  { label: "Preguntas frecuentes", href: "/#faq" },
];

/**
 * Footer 2026: tinta, columnas a la derecha y el wordmark gigante en amarillo
 * recortado por el borde inferior — la marca es más grande que la página.
 * El eco crema desplazado detrás es la sombra dura del logo a escala
 * arquitectónica (invertida: sombra clara sobre tinta).
 */
export function Footer() {
  // Legal (PDFs subidos por el admin) y redes vienen del contenido editable.
  const { legal, social } = useSiteContent();
  const wordmarkRef = useParallax<HTMLDivElement>(-0.06);

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
    <footer className="overflow-hidden bg-brand-ink text-white">
      <div className="mx-auto max-w-[1440px] px-5 pt-16 lg:px-16 lg:pt-20">
        <div className="flex flex-col justify-between gap-12 lg:flex-row">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-cream/70">
            Real English. Real Results.
          </p>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:gap-14">
            {cols.map((col) => (
              <div key={col.title}>
                <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-cream/50">
                  {col.title}
                </div>
                <ul className="mt-5 space-y-3">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        {...(col.external ? { target: "_blank", rel: "noreferrer" } : {})}
                        className="text-[15px] text-brand-cream underline-offset-4 transition-colors hover:text-brand-yellow hover:underline hover:decoration-brand-yellow"
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex items-center justify-between border-t border-brand-cream/15 pt-6 text-[12px] text-brand-cream/50">
          <span>Freakn - Todos los derechos reservados 2026®</span>
          <span className="hidden font-semibold uppercase tracking-[0.14em] sm:block">
            Español → Inglés
          </span>
        </div>

        {/* Wordmark monumental, recortado por el borde inferior */}
        <div
          ref={wordmarkRef}
          className="relative mt-10 h-[160px] sm:h-[220px] lg:h-[300px]"
          style={{ transform: "translateY(var(--parallax-y, 0px))" }}
        >
          <Logo className="absolute left-0 top-0 h-auto w-full" />
        </div>
      </div>
    </footer>
  );
}
