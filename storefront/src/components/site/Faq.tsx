import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const FAQS = [
  {
    q: "¿Puedo elegir mi propio horario de clases?",
    a: "Sí. Al inscribirte seleccionas los horarios fijos que mejor se ajusten a tu rutina. Si necesitas reprogramar, puedes hacerlo desde la plataforma con al menos 12 horas de anticipación.",
  },
  {
    q: "¿Necesito experiencia previa en inglés?",
    a: "No. Ofrecemos niveles desde principiante hasta avanzado. Al inscribirte realizas una prueba de nivelación para ubicarte en el curso ideal.",
    open: true,
  },
  {
    q: "¿Las clases son en vivo o grabadas?",
    a: "Todas las clases son 1 a 1 y completamente en vivo con un profesor real. Adicionalmente tienes acceso a módulos con videos y materiales para reforzar.",
  },
  {
    q: "¿Qué necesito para empezar?",
    a: "Solo necesitas un computador o celular con conexión a internet, audífonos y muchas ganas de hablar inglés desde la primera clase.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="bg-white py-20 lg:py-28 scroll-mt-24">
      <div className="mx-auto max-w-6xl px-5 lg:grid lg:grid-cols-[1fr_1.4fr] lg:gap-16 lg:px-8">
        <div className="max-w-md">
          <h2 className="text-balance text-3xl font-bold leading-tight tracking-tight text-brand-ink sm:text-4xl lg:text-[44px]">
            Si tienes preguntas, tenemos respuestas.
          </h2>
          <p className="mt-4 text-[15px] text-brand-ink/70">
            Todo lo que necesitas saber sobre Freakn English y cómo entregamos resultados.
          </p>
        </div>
        <div className="mt-10 flex flex-col gap-3 lg:mt-0">
          {FAQS.map((f, i) => (
            <FaqItem key={f.q} {...f} defaultOpen={f.open} index={i} />
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
        className="flex w-full items-center justify-between gap-4 text-left transition-colors"
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