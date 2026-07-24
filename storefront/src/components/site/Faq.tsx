import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSiteContent } from "@/lib/site-content";

export function Faq() {
  // Editable desde /admin/site; con la API caída usa defaults quemados.
  const { faqs } = useSiteContent();
  return (
    <section id="faq" className="bg-white py-20 lg:py-28 scroll-mt-24">
      <div className="mx-auto max-w-6xl px-5 lg:grid lg:grid-cols-[1fr_1.4fr] lg:gap-16 lg:px-8">
        <div className="max-w-md">
          <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight text-brand-ink sm:text-4xl lg:text-[44px]">
            Si tienes preguntas, tenemos respuestas.
          </h2>
          <p className="mt-4 text-[15px] text-brand-ink/70">
            Todo lo que necesitas saber sobre FreaknEnglish y cómo entregamos resultados.
          </p>
        </div>
        <div className="mt-10 flex flex-col gap-3 lg:mt-0">
          {faqs.map((f, i) => (
            <FaqItem key={f.q} {...f} defaultOpen={i === 0} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqItem({
  q,
  a,
  defaultOpen,
}: {
  q: string;
  a: string;
  defaultOpen?: boolean;
  index: number;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div
      className={cn(
        "rounded-2xl border border-brand-line bg-white px-5 py-4 transition-all duration-200 hover:border-brand-ink/40",
        open && "shadow-soft border-brand-ink/40",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="-mx-5 -my-4 flex w-[calc(100%+2.5rem)] cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left transition-colors"
        aria-expanded={open}
      >
        <span className="text-[15px] font-semibold text-brand-ink">{q}</span>
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full border border-brand-line text-brand-ink",
            open && "bg-brand-ink text-white border-brand-ink",
          )}
        >
          {open ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
        </span>
      </button>
      {open ? (
        <p className="mt-3 text-[14px] leading-relaxed text-brand-ink/70">{a}</p>
      ) : null}
    </div>
  );
}