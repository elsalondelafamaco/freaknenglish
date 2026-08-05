import { useState } from "react";
import { SiteImage } from "./SiteImage";
import { useSiteContent } from "@/lib/site-content";

/**
 * Miniatura de una card que tiene foto y/o video.
 *
 * Orden de preferencia:
 *   1. La foto que el admin subió para ese slot.
 *   2. Si no subió foto pero sí video: el PRIMER FRAME del video. Se logra con
 *      un `<video>` en `preload="metadata"` y el fragmento `#t=0.1`, que le
 *      pide al navegador pintar ese instante sin descargar el archivo entero
 *      ni reproducir nada.
 *   3. La imagen del bundle (vía `SiteImage`), para no dejar un hueco.
 *
 * Existe porque los testimonios cargados solo con video quedaban sin
 * miniatura: se veía la foto genérica del bundle, que no es de esa persona.
 */
export function MediaThumb({
  imageSlot,
  videoUrl,
  alt,
  className,
}: {
  imageSlot: string;
  videoUrl?: string;
  alt: string;
  className?: string;
}) {
  const { media } = useSiteContent();
  const [videoFallo, setVideoFallo] = useState(false);

  // `media[slot]` solo trae URL cuando el admin la configuró; si es la del
  // bundle, preferimos el frame del video (que sí es de esta persona).
  const fotoPropia = typeof media[imageSlot] === "string" && media[imageSlot].startsWith("http");

  if (!fotoPropia && videoUrl && !videoFallo) {
    return (
      <video
        src={`${videoUrl}#t=0.1`}
        className={className}
        preload="metadata"
        muted
        playsInline
        // Sin controles ni autoplay: es una miniatura, no un reproductor.
        onError={() => setVideoFallo(true)}
        aria-label={alt}
      />
    );
  }
  return <SiteImage slot={imageSlot} alt={alt} className={className} />;
}
