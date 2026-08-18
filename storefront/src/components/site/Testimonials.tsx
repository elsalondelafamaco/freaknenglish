import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ArrowLeft, ArrowRight, Play } from "lucide-react";
import { useSiteContent } from "@/lib/site-content";
import { cn } from "@/lib/utils";
import { MediaThumb } from "./MediaThumb";
import { VideoModal } from "./VideoModal";
import { useReveal } from "./anim";
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

const CARD_W = 380;
const CARD_GAP = 28;

/**
 * Testimonios 2026: carrusel horizontal de tarjetas verticales (los videos
 * son 9:16). Chips arriba, quote como título y el video llenando la tarjeta,
 * con una sola tarjeta "rebelde" en amarillo. Animaciones: entrada escalonada
 * desde la derecha, arrastre con inercia nativa + flechas, barra de progreso
 * amarilla, y preview del video muteado al hacer hover.
 */
export function Testimonials() {
  const { media, testimonials } = useSiteContent();
  const [video, setVideo] = useState<{ src: string; title: string } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  const scrollByCard = (dir: 1 | -1) => {
    trackRef.current?.scrollBy({ left: dir * (CARD_W + CARD_GAP), behavior: "smooth" });
  };

  const onTrackScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setProgress(max > 0 ? el.scrollLeft / max : 0);
  };

  // Drag-to-scroll para mouse (trackpad y touch ya scrollean nativo).
  const drag = useRef<{ startX: number; startLeft: number; active: boolean }>({
    startX: 0,
    startLeft: 0,
    active: false,
  });
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = trackRef.current;
    if (!el) return;
    drag.current = { startX: e.clientX, startLeft: el.scrollLeft, active: true };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (!el || !drag.current.active) return;
    el.scrollLeft = drag.current.startLeft - (e.clientX - drag.current.startX);
  };
  const endDrag = () => {
    drag.current.active = false;
  };

  return (
    <section id="testimonios" className="scroll-mt-24 bg-brand-ink">
      <TickerBand phrases={TICKER} variant="yellow" />
      <div className="mx-auto max-w-[1440px] py-16 lg:py-24">
        <div className="flex flex-col gap-6 px-5 lg:flex-row lg:items-end lg:justify-between lg:px-16">
          <div>
            <div className="h-px w-full bg-brand-cream/25" />
            <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-cream/70">
              <span className="text-brand-yellow">(</span>02 — ¿Porqué nuestro Programa
              Funciona?<span className="text-brand-yellow">)</span>
            </p>
            <h2 className="mt-5 font-display text-4xl font-extrabold uppercase leading-[1.02] tracking-[-0.02em] text-brand-cream sm:text-5xl lg:text-[64px]">
              Conoce los <span className="text-brand-yellow">Testimonios</span>
              <br className="hidden lg:block" /> de Nuestros Estudiantes.
            </h2>
          </div>
          {/* Flechas del carrusel (como los dots de la referencia) */}
          <div className="flex gap-3 self-start lg:self-end">
            <button
              onClick={() => scrollByCard(-1)}
              className="press-hard flex size-12 items-center justify-center rounded-full border-2 border-brand-cream/40 text-brand-cream transition-colors hover:border-brand-yellow hover:text-brand-yellow [--hard-x:0px]"
              aria-label="Anterior"
            >
              <ArrowLeft className="size-5" />
            </button>
            <button
              onClick={() => scrollByCard(1)}
              className="shadow-hard press-hard flex size-12 items-center justify-center rounded-full border-2 border-brand-ink bg-brand-yellow text-brand-ink [--hard-x:4px] [--hard-color:var(--brand-cream)]"
              aria-label="Siguiente"
            >
              <ArrowRight className="size-5" />
            </button>
          </div>
        </div>

        {/* Track horizontal: los items asoman cortados al borde derecho */}
        <div
          ref={trackRef}
          onScroll={onTrackScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          className="mt-12 flex cursor-grab snap-x gap-7 overflow-x-auto pl-5 pr-5 scrollbar-none select-none active:cursor-grabbing lg:pl-16 lg:pr-16"
        >
          {TESTIMONIAL_ITEMS.map((item, i) => {
            const videoUrl = media[item.videoSlot];
            // Nombre y rol editables desde el admin (misma tarjeta donde se
            // sube la foto); si no se configuraron, quedan los del bundle.
            const nombre = testimonials[item.imageSlot]?.name?.trim() || item.name;
            const rol = testimonials[item.imageSlot]?.role?.trim() || item.role;
            return (
              <VideoCard
                key={item.imageSlot}
                index={i}
                quote={item.quote}
                nombre={nombre}
                rol={rol}
                imageSlot={item.imageSlot}
                videoUrl={videoUrl}
                rebel={i === 1}
                onPlay={() => videoUrl && setVideo({ src: videoUrl, title: nombre })}
              />
            );
          })}
        </div>

        {/* Barra de progreso del carrusel */}
        <div className="mx-5 mt-8 h-[3px] bg-brand-cream/15 lg:mx-16">
          <div
            className="h-full bg-brand-yellow transition-[width] duration-150"
            style={{ width: `${Math.round((0.25 + progress * 0.75) * 100)}%` }}
          />
        </div>

        <p className="mt-10 text-center text-[13px] font-semibold uppercase tracking-[0.16em] text-brand-cream/60">
          <span className="text-brand-yellow">✦</span> +2000 Estudiantes{" "}
          <span className="text-brand-yellow">✦</span> +20 Países{" "}
          <span className="text-brand-yellow">✦</span> Clases 1 a 1{" "}
          <span className="text-brand-yellow">✦</span>
        </p>
      </div>
      {video ? <VideoModal src={video.src} title={video.title} onClose={() => setVideo(null)} /> : null}
    </section>
  );
}

/**
 * Tarjeta vertical estilo referencia: chips arriba, quote como título y el
 * video (vertical) llenando el resto. Hover: el video se reproduce muteado.
 */
function VideoCard({
  index,
  quote,
  nombre,
  rol,
  imageSlot,
  videoUrl,
  rebel,
  onPlay,
}: {
  index: number;
  quote: string;
  nombre: string;
  rol: string;
  imageSlot: string;
  videoUrl?: string;
  rebel: boolean;
  onPlay: () => void;
}) {
  const ref = useReveal<HTMLDivElement>(0.15);
  const [hover, setHover] = useState(false);

  return (
    <div
      ref={ref}
      className="reveal-x shrink-0 snap-start"
      style={{ "--reveal-delay": `${index * 110}ms`, width: CARD_W } as CSSProperties}
    >
      <article
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={cn(
          "group flex h-[600px] flex-col overflow-hidden border-2 transition-transform duration-300 hover:-translate-y-2",
          rebel
            ? "shadow-hard border-brand-ink bg-brand-yellow text-brand-ink"
            : "border-brand-cream/30 bg-brand-cream text-brand-ink",
        )}
      >
        {/* Chips + índice */}
        <div className="flex items-center justify-between p-5 pb-0">
          <div className="flex gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-brand-ink px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]">
              <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />
              Caso real
            </span>
            <span className="inline-flex max-w-[180px] items-center truncate whitespace-nowrap rounded-full border-[1.5px] border-brand-ink/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-brand-ink/70">
              {rol}
            </span>
          </div>
          <span className="text-[12px] font-semibold text-brand-ink/45">0{index + 1}</span>
        </div>

        {/* Quote como título */}
        <p className="p-5 pt-4 font-display text-[21px] font-bold leading-[1.22]">
          &ldquo;{quote}&rdquo;
        </p>

        {/* Video vertical llenando el resto de la tarjeta */}
        <div className="relative mx-3 mb-3 flex-1 overflow-hidden">
          <MediaThumb
            imageSlot={imageSlot}
            videoUrl={videoUrl}
            alt={nombre}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-all duration-500",
              hover && videoUrl ? "opacity-0" : "opacity-100 group-hover:scale-[1.03]",
            )}
          />
          {/* Preview muteado al hover (el modal reproduce con sonido) */}
          {hover && videoUrl ? (
            <video
              src={videoUrl}
              muted
              autoPlay
              loop
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

          {videoUrl ? (
            <>
              <button
                onClick={onPlay}
                className={cn(
                  "shadow-hard press-hard absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-brand-ink bg-brand-yellow transition-opacity duration-300 [--hard-x:4px] [--hard-color:var(--brand-ink)]",
                  hover && "opacity-0",
                )}
                aria-label={`Reproducir testimonio de ${nombre}`}
              >
                <Play className="size-6 translate-x-0.5 fill-brand-ink text-brand-ink" />
              </button>
              <button
                onClick={onPlay}
                className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-[12px] font-semibold text-brand-ink transition-transform duration-200 hover:scale-[1.04]"
              >
                Ver testimonio <ArrowRight className="size-3.5" />
              </button>
            </>
          ) : null}

          {/* Nombre sobre el video */}
          <div className="pointer-events-none absolute bottom-4 right-4 text-right text-white">
            <div className="font-display text-[14px] font-bold uppercase drop-shadow">{nombre}</div>
          </div>
        </div>
      </article>
    </div>
  );
}
