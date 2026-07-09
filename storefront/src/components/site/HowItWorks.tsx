import { CalendarDays, Monitor, MessageCircle, Play, Zap } from "lucide-react";
import how1 from "@/assets/how-1-schedule.jpg";
import how2 from "@/assets/how-2-classes.jpg";
import how3 from "@/assets/how-3-confidence.jpg";
import { DarkPillLink } from "./DarkPillButton";

const STEPS = [
  {
    icon: CalendarDays,
    title: "Escoge tu horario",
    body: "Selecciona uno de los horarios que mejor se adapta a tus necesidades.",
    img: how1,
    badge: "Llamada 15 min",
    badgeSub: "Conoce cómo funciona",
  },
  {
    icon: Monitor,
    title: "Empieza tus clases",
    body: "Clases en vivo personalizadas enfocadas en conversación desde el primer día.",
    img: how2,
    badge: "Freakn'",
    badgeSub: "Live class",
  },
  {
    icon: MessageCircle,
    title: "Habla con confianza",
    body: "Practica constantemente y deja de traducir para empezar a pensar en inglés.",
    img: how3,
    badge: "Great job!",
    badgeSub: "Tu pronunciación cada vez es mejor.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="como-funciona" className="bg-white py-20 lg:py-28 scroll-mt-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-brand-ink/60">¿Cómo Funciona Freakn?</p>
            <h2 className="mt-2 text-balance text-3xl font-bold leading-tight tracking-tight text-brand-ink sm:text-4xl lg:text-[44px]">
              Así es como empiezas a hablar inglés desde el día 1
            </h2>
            <p className="mt-3 text-[15px] text-brand-ink/70">
              Un proceso simple, práctico y enfocado en que hables,{" "}
              <strong className="font-semibold text-brand-ink">no en que memorices.</strong>
            </p>
          </div>
          <DarkPillLink to="/" hash="planes" size="md" className="self-start lg:self-auto">
            Escoge tu Horario ahora
          </DarkPillLink>
        </div>

        {/* Desktop grid / mobile horizontal scroll */}
        <div className="mt-12 -mx-5 px-5 lg:mx-0 lg:px-0">
          <div className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 scrollbar-none lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-visible">
            {STEPS.map((s) => (
              <StepCard key={s.title} {...s} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StepCard({
  icon: Icon,
  title,
  body,
  img,
  badge,
  badgeSub,
}: (typeof STEPS)[number]) {
  return (
    <article className="relative min-w-[85%] snap-center rounded-3xl border border-brand-line bg-white p-4 shadow-soft lg:min-w-0">
      <div className="flex items-start gap-3 px-2 pt-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-brand-yellow">
          <Icon className="size-5 text-brand-ink" strokeWidth={2.4} />
        </span>
        <div>
          <h3 className="text-base font-semibold text-brand-ink">{title}</h3>
          <p className="mt-1 text-[13px] leading-snug text-brand-ink/65">{body}</p>
        </div>
      </div>

      <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-2xl">
        <img
          src={img}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover"
        />
        <button
          type="button"
          className="absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 backdrop-blur transition hover:scale-105"
          aria-label="Reproducir video"
        >
          <Play className="size-5 translate-x-0.5 fill-brand-ink text-brand-ink" />
        </button>

        <div className="absolute bottom-3 left-3 rounded-xl bg-white/95 px-2.5 py-1.5 shadow">
          <div className="text-[11px] font-semibold text-brand-ink">{badge}</div>
          <div className="text-[10px] text-brand-ink/60">{badgeSub}</div>
        </div>

        <span className="absolute bottom-3 right-3 flex size-7 items-center justify-center rounded-full bg-brand-yellow">
          <Zap className="size-4 fill-brand-ink text-brand-ink" />
        </span>
      </div>
    </article>
  );
}