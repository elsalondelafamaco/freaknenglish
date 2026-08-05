import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Play } from "lucide-react";
import { useSiteContent } from "@/lib/site-content";
import { MediaThumb } from "./MediaThumb";
import { VideoModal } from "./VideoModal";

const ITEMS = [
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

export function Testimonials() {
  const trackRef = useRef<HTMLDivElement>(null);
  const { media, testimonials } = useSiteContent();
  const [video, setVideo] = useState<{ src: string; title: string } | null>(null);

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card]");
    const step = card ? card.offsetWidth + 20 : 320;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <section id="testimonios" className="bg-white pb-20 lg:pb-28 scroll-mt-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-brand-ink/60">
              ¿Porqué nuestro Programa Funciona?
            </p>
            <h2 className="mt-2 text-balance text-3xl font-bold leading-tight tracking-tight text-brand-ink sm:text-4xl lg:text-[44px]">
              Conoce los Testimonios de Nuestros Estudiantes
            </h2>
          </div>
          <div className="flex gap-2 self-start lg:self-end">
            <button
              onClick={() => scrollBy(-1)}
              className="flex size-11 items-center justify-center rounded-full bg-brand-ink text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-ink-soft hover:shadow-lg active:scale-95"
              aria-label="Anterior"
            >
              <ArrowLeft className="size-5" />
            </button>
            <button
              onClick={() => scrollBy(1)}
              className="flex size-11 items-center justify-center rounded-full bg-brand-ink text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-ink-soft hover:shadow-lg active:scale-95"
              aria-label="Siguiente"
            >
              <ArrowRight className="size-5" />
            </button>
          </div>
        </div>

        <div
          ref={trackRef}
          className="mt-10 -mx-5 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4 scrollbar-none lg:mx-0 lg:px-0"
        >
          {ITEMS.map((item) => {
            const videoUrl = media[item.videoSlot];
            // Nombre y rol editables desde el admin (misma tarjeta donde se
            // sube la foto); si no se configuraron, quedan los del bundle.
            const nombre = testimonials[item.imageSlot]?.name?.trim() || item.name;
            const rol = testimonials[item.imageSlot]?.role?.trim() || item.role;
            return (
              <article
                key={item.name}
                data-card
                className="relative min-w-[85%] snap-center overflow-hidden rounded-3xl border border-brand-line bg-white shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg sm:min-w-[360px] lg:flex-1"
              >
                <div className="p-5">
                  <p className="text-[15px] font-semibold leading-snug text-brand-ink">
                    &ldquo;{item.quote}&rdquo;
                  </p>
                  <p className="mt-2 text-[13px] leading-snug text-brand-ink/65">{item.body}</p>
                </div>
                <div className="relative aspect-[3/4]">
                  <MediaThumb
                    imageSlot={item.imageSlot}
                    videoUrl={videoUrl}
                    alt={nombre}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/70 via-black/40 to-transparent p-4 text-white">
                    {videoUrl ? (
                      <button
                        onClick={() => setVideo({ src: videoUrl, title: nombre })}
                        className="flex size-9 items-center justify-center rounded-full bg-white/90 transition-all duration-200 hover:scale-110 hover:bg-white active:scale-95"
                        aria-label={`Reproducir testimonio de ${nombre}`}
                      >
                        <Play className="size-4 translate-x-0.5 fill-brand-ink text-brand-ink" />
                      </button>
                    ) : null}
                    <div>
                      <div className="text-sm font-semibold">{nombre}</div>
                      <div className="text-xs opacity-80">{rol}</div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
      {video ? <VideoModal src={video.src} title={video.title} onClose={() => setVideo(null)} /> : null}
    </section>
  );
}
