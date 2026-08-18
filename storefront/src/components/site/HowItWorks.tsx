import { useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, Play } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useSiteContent } from "@/lib/site-content";
import { cn } from "@/lib/utils";
import { MediaThumb } from "./MediaThumb";
import { VideoModal } from "./VideoModal";
import { Reveal, useCountUp, useInViewOnce, useParallax } from "./anim";

const STEPS = ["Escoge tu horario", "Empieza tus clases", "Habla con confianza"] as const;

const WAVE = [7, 13, 18, 10, 16, 8, 14, 19, 11, 7, 15, 9, 13, 6, 11, 17];

/**
 * ¿Cómo Funciona? 2026: en lugar de 3 tarjetas estáticas, un "diorama" de la
 * clase sucediendo — ventana de videollamada real (slot how-2) rodeada de las
 * tarjetas del producto (progreso, vocabulario, feedback) flotando con
 * parallax. El riel de pasos 01→03 resume el proceso arriba.
 */
export function HowItWorks() {
  const { media } = useSiteContent();
  const [video, setVideo] = useState<{ src: string; title: string } | null>(null);
  const claseVideo = media["how-2-video"];

  return (
    <section id="como-funciona" className="scroll-mt-24 bg-brand-cream py-16 lg:py-24">
      <div className="mx-auto max-w-[1440px] px-5 lg:px-16">
        {/* Header editorial dividido */}
        <Reveal>
          <div className="h-px w-full bg-brand-ink/25" />
          <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-ink/60">
                <span className="text-brand-yellow">(</span>01 — ¿Cómo Funciona Freakn?
                <span className="text-brand-yellow">)</span>
              </p>
              <h2 className="mt-5 font-display text-4xl font-extrabold uppercase leading-[1.02] tracking-[-0.02em] text-brand-ink sm:text-5xl lg:text-[68px]">
                Así es como empiezas
                <br className="hidden lg:block" /> a hablar inglés
                <br className="hidden lg:block" /> desde el{" "}
                <span className="marker-highlight">día 1.</span>
              </h2>
            </div>
            <p className="max-w-[320px] text-[15px] leading-relaxed text-brand-ink/70">
              Un proceso simple, práctico y enfocado en que hables,{" "}
              <strong className="font-semibold text-brand-ink">no en que memorices.</strong>
            </p>
          </div>
        </Reveal>

        {/* Riel de pasos */}
        <Reveal delay={120}>
          <div className="relative mt-14 hidden items-center justify-center lg:flex">
            <div className="absolute inset-x-0 top-1/2 h-px bg-brand-ink/20" />
            <div className="relative flex items-center gap-9 bg-brand-cream px-8">
              {STEPS.map((s, i) => (
                <div key={s} className="flex items-center gap-9">
                  <div className="flex items-center gap-3">
                    <span className="font-display text-[32px] font-extrabold text-brand-yellow [text-shadow:2px_2px_0_var(--brand-ink)]">
                      0{i + 1}.
                    </span>
                    <span className="font-display text-[16px] font-bold uppercase tracking-[0.01em] text-brand-ink">
                      {s}
                    </span>
                  </div>
                  {i < STEPS.length - 1 ? (
                    <ArrowRight className="size-6 text-brand-yellow" strokeWidth={2.5} />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* Diorama */}
        <Reveal delay={200}>
          <div className="shadow-hard relative mt-12 border-2 border-brand-ink bg-brand-ink px-5 py-16 [--hard-x:10px] lg:mt-14 lg:h-[640px] lg:px-0 lg:py-0">
            {/* Palabra fantasma */}
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-2 right-6 hidden select-none font-display text-[180px] font-extrabold tracking-[-0.03em] text-brand-cream/[0.06] lg:block"
            >
              SPEAK.
            </span>

            {/* Ventana de la clase (video real del admin si existe) */}
            <div className="relative mx-auto max-w-[660px] border-2 border-brand-cream lg:absolute lg:left-20 lg:top-1/2 lg:w-[660px] lg:max-w-none lg:-translate-y-1/2">
              <div className="relative aspect-[3/2] overflow-hidden">
                <MediaThumb
                  imageSlot="how-2-image"
                  videoUrl={claseVideo}
                  alt="Clase 1 a 1 en vivo"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-brand-ink/90 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
                  <span className="size-2 rounded-full bg-red-500 animate-pulse" />
                  Live
                </span>
                <span className="absolute right-4 top-4 rounded-full bg-brand-ink/90 px-3 py-1.5 text-[11px] font-semibold text-white">
                  27:14 / 50:00
                </span>
                {claseVideo ? (
                  <button
                    onClick={() => setVideo({ src: claseVideo, title: "Así es una clase Freakn" })}
                    className="shadow-hard press-hard absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-brand-ink bg-brand-yellow [--hard-x:4px] [--hard-color:var(--brand-ink)]"
                    aria-label="Ver cómo es una clase"
                  >
                    <Play className="size-6 translate-x-0.5 fill-brand-ink text-brand-ink" />
                  </button>
                ) : null}
                <span className="absolute bottom-4 left-4 border-2 border-brand-ink bg-brand-yellow px-3.5 py-2 font-display text-[13px] font-bold uppercase tracking-[0.02em] text-brand-ink">
                  Tu clase 1 a 1 · En vivo
                </span>
              </div>
            </div>

            {/* Tarjetas flotantes del producto (parallax + flotación) */}
            <FloatCard className="lg:right-[300px] lg:top-12" speed={0.06} rot={2}>
              <ProgressCard />
            </FloatCard>
            <FloatCard className="lg:right-16 lg:top-[300px]" speed={-0.05} rot={-2}>
              <VocabCard />
            </FloatCard>
            <FloatCard className="lg:bottom-14 lg:left-[420px]" speed={0.09} rot={1.5}>
              <FeedbackCard />
            </FloatCard>
            <FloatCard className="lg:-top-8 lg:left-10" speed={-0.07} rot={-2.5}>
              <ClaseEnVivoCard />
            </FloatCard>
          </div>
        </Reveal>

        {/* CTA */}
        <Reveal delay={150}>
          <div className="mt-14 flex items-center justify-center gap-4">
            <span aria-hidden className="hidden text-xl text-brand-ink lg:block">
              ✦
            </span>
            <Link
              to="/checkout"
              className="shadow-hard press-hard inline-flex items-center gap-3 rounded-full bg-brand-ink px-10 py-5 font-display text-[16px] font-bold uppercase tracking-[0.02em] text-brand-cream"
            >
              Escoge tu Horario ahora
              <ArrowRight className="size-5" />
            </Link>
          </div>
        </Reveal>
      </div>
      {video ? <VideoModal src={video.src} title={video.title} onClose={() => setVideo(null)} /> : null}
    </section>
  );
}

/** Capa doble: el div externo hace parallax, el interno flota y rota. */
function FloatCard({
  children,
  className,
  speed,
  rot,
}: {
  children: ReactNode;
  className?: string;
  speed: number;
  rot: number;
}) {
  const ref = useParallax<HTMLDivElement>(speed);
  return (
    <div
      ref={ref}
      className={cn("mt-6 lg:absolute lg:mt-0", className)}
      style={{ transform: "translateY(var(--parallax-y, 0px))" }}
    >
      <div
        className="animate-float"
        style={{ "--float-rot": `${rot}deg`, "--float-speed": `${4.5 + Math.abs(speed) * 20}s` } as CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}

function CardShell({ label, children, labelExtra }: { label: string; children: ReactNode; labelExtra?: ReactNode }) {
  return (
    <div className="shadow-hard w-fit border-2 border-brand-ink bg-white p-5 text-brand-ink">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-ink/50">
        {labelExtra}
        {label}
      </div>
      {children}
    </div>
  );
}

function ProgressCard() {
  const [ref, inView] = useInViewOnce<HTMLDivElement>(0.4);
  const pct = useCountUp(82, inView, 1600);
  return (
    <div ref={ref}>
      <CardShell label="Progreso de Habla">
        <div className="mt-1 font-display text-[42px] font-extrabold leading-none">{pct}%</div>
        <div className="mt-3 flex items-end gap-1.5">
          {[14, 22, 18, 30, 26, 38, 44].map((h, i) => (
            <span
              key={i}
              className={cn("w-2 rounded-[2px]", h > 35 ? "bg-brand-yellow" : "bg-brand-ink/85")}
              style={{ height: inView ? h : 4, transition: `height .7s ${i * 90}ms cubic-bezier(.22,1,.36,1)` }}
            />
          ))}
        </div>
        <div className="mt-2.5 text-[12px] font-semibold text-brand-success">↗ +12% esta semana</div>
      </CardShell>
    </div>
  );
}

function VocabCard() {
  return (
    <CardShell label="Nuevo Vocabulario">
      <div className="mt-1.5 font-display text-[24px] font-bold">Adventure</div>
      <div className="text-[13px] italic text-brand-ink/60">/əd&apos;ven.tʃər/</div>
      <div className="mt-1 text-[13px] text-brand-ink/65">A fun or exciting experience.</div>
    </CardShell>
  );
}

function FeedbackCard() {
  const [ref, inView] = useInViewOnce<HTMLDivElement>(0.4);
  return (
    <div ref={ref}>
      <CardShell label="Teacher Feedback">
        <p className="mt-1.5 max-w-[230px] text-[14px] font-semibold leading-snug">
          &ldquo;Great job! Your pronunciation is getting much better.&rdquo;
        </p>
        <div className="mt-3 flex items-center gap-[3px]">
          <span className="mr-1 flex size-6 items-center justify-center rounded-full bg-brand-success">
            <Play className="size-3 translate-x-px fill-white text-white" />
          </span>
          {WAVE.map((h, i) => (
            <span
              key={i}
              className={cn("w-[3px] rounded-full bg-brand-ink/70", inView && "animate-wave")}
              style={{ height: h, animationDelay: `${i * 90}ms` }}
            />
          ))}
          <span className="ml-1.5 text-[11px] text-brand-ink/55">0:18</span>
        </div>
      </CardShell>
    </div>
  );
}

function ClaseEnVivoCard() {
  const { media } = useSiteContent();
  const spheres = [
    media["sphere-1"] ?? media["avatar-teacher"],
    media["sphere-2"] ?? media["avatar-teacher"],
    media["sphere-3"] ?? media["avatar-teacher"],
  ];
  return (
    <CardShell
      label="Clase en Vivo"
      labelExtra={<span className="size-1.5 rounded-full bg-red-500 animate-pulse" />}
    >
      <div className="mt-1.5 font-display text-[18px] font-bold">Travel &amp; Adventures</div>
      <div className="text-[13px] text-brand-ink/60">8:00 PM – 9:00 PM</div>
      <div className="mt-2.5 flex -space-x-2">
        {spheres.map((src, i) =>
          src ? (
            <img key={i} src={src} alt="" className="size-7 rounded-full border-2 border-white object-cover" />
          ) : (
            <span key={i} className="size-7 rounded-full border-2 border-white bg-gradient-to-br from-amber-200 to-amber-400" />
          ),
        )}
        <span className="!ml-1 flex size-7 items-center justify-center rounded-full border-2 border-white bg-brand-yellow text-[11px] font-bold text-brand-ink">
          +1
        </span>
      </div>
    </CardShell>
  );
}
