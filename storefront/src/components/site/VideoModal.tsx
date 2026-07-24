import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Reproductor de video en overlay para la home (videos de "Cómo funciona" y
 * testimonios). HTML5 nativo — las URLs vienen de MinIO vía site-content.
 */
export function VideoModal({ src, title, onClose }: { src: string; title?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Video"}
    >
      <div className="relative w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-11 right-0 flex size-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/30"
          aria-label="Cerrar video"
        >
          <X className="size-5" />
        </button>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video src={src} controls autoPlay playsInline className="max-h-[78vh] w-full rounded-2xl bg-black shadow-2xl" />
      </div>
    </div>
  );
}
