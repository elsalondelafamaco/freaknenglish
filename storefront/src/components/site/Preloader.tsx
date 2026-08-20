import { useEffect, useState } from "react";
import { Logo } from "./Logo";

/**
 * Preloader de marca del primer pintado: pantalla tinta con el wordmark
 * (blanco + sombra amarilla) y una barra amarilla de progreso; a ~1.1s hace
 * wipe hacia arriba y se desmonta. Vive en el SSR para que nunca haya flash
 * de contenido sin vestir. El bloque global de prefers-reduced-motion
 * acelera las animaciones a ~0, así que para esos usuarios es invisible.
 */
export function Preloader() {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // Bloquea el scroll mientras el telón está puesto.
    document.documentElement.style.overflow = "hidden";
    const t = setTimeout(() => {
      setGone(true);
      document.documentElement.style.overflow = "";
    }, 1550);
    return () => {
      clearTimeout(t);
      document.documentElement.style.overflow = "";
    };
  }, []);

  if (gone) return null;

  return (
    <div
      aria-hidden
      className="animate-preloader-wipe fixed inset-0 z-[100] flex flex-col items-center justify-center bg-brand-ink"
    >
      <div className="animate-preloader-logo text-white">
        <Logo className="h-14 w-auto sm:h-16" />
      </div>
      <div className="mt-8 h-[3px] w-40 overflow-hidden bg-white/15">
        <div className="animate-preloader-bar h-full bg-brand-yellow" />
      </div>
    </div>
  );
}
