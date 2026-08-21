/**
 * Primitivos de animación de la landing 2026, sin dependencias:
 * reveal-on-scroll (IntersectionObserver), count-up, parallax por scroll
 * y marquee infinito. El bloque global de prefers-reduced-motion en
 * styles.css anula todas estas animaciones para quien lo pida.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** Marca el elemento con `.is-in` cuando entra al viewport (una sola vez). */
export function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-in");
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return ref;
}

/** Contenedor con la utilidad `reveal`; `delay` escalona hermanos. */
export function Reveal({
  children,
  delay = 0,
  className = "",
  threshold,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  threshold?: number;
}) {
  const ref = useReveal<HTMLDivElement>(threshold);
  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}

/** Como useReveal pero devuelve el estado (para disparar lógica JS, no CSS). */
export function useInViewOnce<T extends HTMLElement = HTMLDivElement>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

/** Cuenta de 0 a `target` cuando `started` pasa a true (easing out-cubic). */
export function useCountUp(target: number, started: boolean, duration = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, started, duration]);
  return value;
}

/**
 * Parallax ligado al scroll: desplaza el elemento según su distancia al
 * centro del viewport. `speed` positivo se mueve con el scroll, negativo
 * en contra. rAF-throttled; solo transform, sin reflow.
 */
export function useParallax<T extends HTMLElement = HTMLDivElement>(speed = 0.1) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const mid = r.top + r.height / 2 - window.innerHeight / 2;
      el.style.setProperty("--parallax-y", `${(-mid * speed).toFixed(1)}px`);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [speed]);
  return ref;
}

/** true una vez que el usuario pasó `threshold` px de scroll (para el navbar). */
export function useScrolled(threshold = 80) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

/**
 * Cinta infinita: renderiza `children` dos veces y desplaza el track -50%.
 * El contenido debe ser más ancho que el contenedor (usar suficientes items).
 */
export function Marquee({
  children,
  speed = 32,
  className = "",
}: {
  children: ReactNode;
  speed?: number;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden ${className}`}>
      <div
        className="flex w-max animate-marquee items-center"
        style={{ "--marquee-speed": `${speed}s` } as CSSProperties}
      >
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
