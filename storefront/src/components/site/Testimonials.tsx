import { useState } from "react";
import { Play } from "lucide-react";
import { useSiteContent } from "@/lib/site-content";
import { cn } from "@/lib/utils";
import { MediaThumb } from "./MediaThumb";
import { VideoModal } from "./VideoModal";
import { Reveal } from "./anim";
import { TickerBand } from "./TickerBand";

/** Exportado: el rotador del Hero usa los mismos items + overrides del admin. */
export const TESTIMONIAL_ITEMS = [
  {
    quote: "En 3 meses ya podía hablar en mis reuniones de trabajo sin miedo.",
    body: "Antes me quedaba en blanco, ahora participo y me expreso con confianza.",
    name: "Carlos M.",
    role: "Profesional en Marketing",
    imageSlot: "testimonial-1-image",
    videoSlot: "testimonial-1-video",
  },
  {
    quote: "Por fin entendí inglés y dejé de traducir todo en mi cabeza.",
    body: "Las clases son dinámicas y los profesores te corrigen de verdad. Se nota el progreso.",
    name: "Valentina R.",
    role: "Estudiante Universitaria",
    imageSlot: "testimonial-2-image",
    videoSlot: "testimonial-2-video",
  },
  {
    quote: "Ahora puedo viajar y pensar en inglés, fue un antes y un después.",
    body: "Freakn me dio las herramientas para soltarme y disfrutar cada conversación.",
    name: "Andrés T.",
    role: "Emprendedor",
    imageSlot: "testimonial-3-image",
    videoSlot: "testimonial-3-video",
  },
  {
    quote: "Las clases 1 a 1 son lo mejor, 100% personal y efectivas.",
    body: "Me siento acompañado en todo el proceso y los resultados son increíbles.",
    name: "Mariana G.",
    role: "Diseñadora UX",
    imageSlot: "testimonial-4-image",
    videoSlot: "testimonial-4-video",
  },
] as const;

const TICKER = [
  "CASOS REALES",
  "HABLA DESDE EL DÍA 1",
  "CLASES 1 A 1 EN VIVO",
  "RESULTADOS QUE SE ESCUCHAN",
];

/**
 * Testimonios 2026: el momento oscuro de la página. Grid 2×2 de tarjetas de
 * VIDEO (thumbnail + play + chip "caso real"); una sola tarjeta "rebelde" en
 * crema rompe la retícula — la restricción mantiene fuerte el lenguaje.
 */
export function Testimonials() {
  const { media, testimonials } = useSiteContent();
  const [video, setVideo] = useState<{ src: string; title: string } | null>(null);

  return (
    <section id="testimonios" className="scroll-mt-24 bg-brand-ink">
      <TickerBand phrases={TICKER} variant="yellow" />
      <div className="mx-auto max-w-[1440px] px-5 py-16 lg:px-16 lg:py-24">
        <Reveal>
          <div className="h-px w-full bg-brand-cream/25" />
          <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-cream/70">
            <span className="text-brand-yellow">(</span>02 — ¿Porqué nuestro Programa Funciona?
            <span className="text-brand-yellow">)</span>
          </p>
          <h2 className="mt-5 font-display text-4xl font-extrabold uppercase leading-[1.02] tracking-[-0.02em] text-brand-cream sm:text-5xl lg:text-[68px]">
            Conoce los <span className="text-brand-yellow">Testimonios</span>
            <br className="hidden lg:block" /> de Nuestros Estudiantes.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          {TESTIMONIAL_ITEMS.map((item, i) => {
            const videoUrl = media[item.videoSlot];
            // Nombre y rol editables desde el admin (misma tarjeta donde se
            // sube la foto); si no se configuraron, quedan los del bundle.
            const nombre = testimonials[item.imageSlot]?.name?.trim() || item.name;
            const rol = testimonials[item.imageSlot]?.role?.trim() || item.role;
            const rebel = i === 1;
            return (
              <Reveal key={item.imageSlot} delay={(i % 2) * 120}>
                <article
                  className={cn(
                    "group overflow-hidden",
                    rebel
                      ? "shadow-hard -rotate-[1.5deg] border-2 border-brand-ink bg-brand-cream text-brand-ink transition-transform duration-300 hover:rotate-0"
                      : "border border-brand-cream/25 bg-brand-ink text-brand-cream",
                  )}
                >
                  {/* Thumbnail de video */}
                  <div className="relative aspect-[16/9] overflow-hidden">
                    <MediaThumb
                      imageSlot={item.imageSlot}
                      videoUrl={videoUrl}
                      alt={nombre}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                    <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-brand-ink/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-cream">
                      <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />
                      Caso real
                    </span>
                    {videoUrl ? (
                      <button
                        onClick={() => setVideo({ src: videoUrl, title: nombre })}
                        className="shadow-hard press-hard absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-brand-ink bg-brand-yellow [--hard-x:4px] [--hard-color:var(--brand-ink)]"
                        aria-label={`Reproducir testimonio de ${nombre}`}
                      >
                        <Play className="size-6 translate-x-0.5 fill-brand-ink text-brand-ink" />
                      </button>
                    ) : null}
                  </div>
                  <div className={cn("h-0.5 w-full", rebel ? "bg-brand-ink" : "bg-brand-yellow")} />

                  {/* Cuerpo */}
                  <div className="flex flex-col gap-3 p-7">
                    <p className="font-display text-[21px] font-bold leading-[1.28]">
                      &ldquo;{item.quote}&rdquo;
                    </p>
                    <p className={cn("text-[14px] leading-relaxed", rebel ? "text-brand-ink/70" : "text-brand-cream/70")}>
                      {item.body}
                    </p>
                    <div className="mt-1 flex items-end justify-between">
                      <div>
                        <div className="font-display text-[15px] font-bold uppercase">{nombre}</div>
                        <div className={cn("text-[13px]", rebel ? "text-brand-ink/60" : "text-brand-cream/60")}>
                          {rol}
                        </div>
                      </div>
                      <span className={cn("text-[13px] font-semibold", rebel ? "text-brand-ink/50" : "text-brand-cream/50")}>
                        <span className="text-brand-yellow">(</span>0{i + 1}
                        <span className="text-brand-yellow">)</span>
                      </span>
                    </div>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>

        <Reveal>
          <p className="mt-14 text-center text-[13px] font-semibold uppercase tracking-[0.16em] text-brand-cream/60">
            <span className="text-brand-yellow">✦</span> +2000 Estudiantes{" "}
            <span className="text-brand-yellow">✦</span> +20 Países{" "}
            <span className="text-brand-yellow">✦</span> Clases 1 a 1{" "}
            <span className="text-brand-yellow">✦</span>
          </p>
        </Reveal>
      </div>
      {video ? <VideoModal src={video.src} title={video.title} onClose={() => setVideo(null)} /> : null}
    </section>
  );
}
