import { useSiteContent } from "@/lib/site-content";

/**
 * Frase de aceptación de términos/política conectada a los mismos documentos
 * legales de la home (PDFs subidos desde el admin). Abren en pestaña aparte;
 * si aún no hay documento configurado se muestra el texto sin link muerto.
 */
export function LegalLinks({ prefix = "Al continuar aceptas nuestros" }: { prefix?: string }) {
  const { legal } = useSiteContent();
  const doc = (href: string | undefined, label: string) =>
    href ? (
      <a href={href} target="_blank" rel="noreferrer" className="underline hover:text-brand-ink">
        {label}
      </a>
    ) : (
      <span>{label}</span>
    );
  return (
    <p className="text-center text-xs text-brand-ink/55">
      {prefix} {doc(legal.terms, "Términos y condiciones")} y la {doc(legal.privacy, "Política de privacidad")}.
    </p>
  );
}
