import { useEffect, useRef, useState } from "react";
import { mediaFallback, mediaUrl, type MediaSlotId } from "@/lib/site-content";

/**
 * Imagen de la home apuntando a una URL ESTABLE por slot.
 *
 * El `src` no cambia nunca entre cargas: siempre
 * `/public/settings/media/<slot>`, y el backend redirige al objeto actual en
 * MinIO. Cuando el admin sube una imagen nueva se reemplaza el objeto detrás
 * de esa misma URL, así que no hay parpadeo ni cambio de imagen a mitad de
 * carga (que era el problema: el sitio pintaba el asset del bundle y luego
 * saltaba a la URL de MinIO cuando respondía la API).
 *
 * Si la remota falla o el slot no tiene imagen (404), cae a la del bundle, de
 * modo que nunca queda un hueco.
 */
export function SiteImage({
  slot,
  alt,
  className,
  loading = "lazy",
}: {
  slot: MediaSlotId | string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
}) {
  const respaldo = mediaFallback(slot);
  const [src, setSrc] = useState(() => mediaUrl(slot));
  const ref = useRef<HTMLImageElement>(null);

  const caerAlRespaldo = () => {
    // Una sola vez: si ya estamos en el respaldo, no reintentar.
    if (respaldo && src !== respaldo) setSrc(respaldo);
  };

  // El HTML llega renderizado del servidor, así que la imagen empieza a cargar
  // ANTES de la hidratación: si falla en ese hueco, el `onError` de React nunca
  // se entera y el hueco se queda vacío. Al montar revisamos el estado real del
  // <img> (`complete` con `naturalWidth` en 0 = falló) para cubrir ese caso.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) caerAlRespaldo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      loading={loading}
      className={className}
      onError={caerAlRespaldo}
    />
  );
}
