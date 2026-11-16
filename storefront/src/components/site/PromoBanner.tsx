import { useEffect, useRef, useState } from "react";
import { usePromos } from "@/lib/domain/use-promos";
import { promoDeBanner, textoBadge, type PromoPublica } from "@/lib/domain/promos";

/** "2d 05h 12m" / "05h 12m 09s": hasta el fin de la promo. */
export function cuentaRegresiva(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dos = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${dos(h)}h ${dos(m)}m` : `${dos(h)}h ${dos(m)}m ${dos(s)}s`;
}

/** Texto del banner: el del admin o, si no puso, uno derivado del descuento. */
export function textoDeBanner(p: Pick<PromoPublica, "bannerText" | "badgeText" | "discountType" | "discountValue">) {
  return p.bannerText?.trim() || `Promoción activa: ${textoBadge(p)} en tu plan`;
}

/**
 * Barra de anuncio de la home. Va en el flujo (no flotante) y publica su alto en
 * `--promo-h` para que el menú fijo se coloque justo debajo en vez de taparla.
 */
export function PromoBanner() {
  const { promos } = usePromos();
  const promo = promoDeBanner(promos);
  const ref = useRef<HTMLDivElement>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  // Con cuenta regresiva se refresca cada segundo; sin ella basta cada 30 s
  // para que la barra desaparezca sola cuando la promo vence.
  const conCuenta = !!promo?.showCountdown && !!promo?.endsAt;
  useEffect(() => {
    if (!promo) return;
    const t = setInterval(() => setAhora(Date.now()), conCuenta ? 1000 : 30_000);
    return () => clearInterval(t);
  }, [promo, conCuenta]);

  const fin = promo?.endsAt ? new Date(promo.endsAt).getTime() : null;
  const visible = !!promo && (fin === null || fin > ahora);

  useEffect(() => {
    const root = document.documentElement;
    if (!visible || !ref.current) {
      root.style.setProperty("--promo-h", "0px");
      return;
    }
    const el = ref.current;
    const medir = () => root.style.setProperty("--promo-h", `${el.offsetHeight}px`);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty("--promo-h", "0px");
    };
  }, [visible]);

  if (!visible || !promo) return null;
  return (
    <div
      ref={ref}
      role="region"
      aria-label="Promoción"
      className="relative z-50 w-full"
      style={{ backgroundColor: promo.bgColor, color: promo.textColor }}
    >
      <a
        href="#precios"
        className="mx-auto flex min-h-10 max-w-[1440px] flex-wrap items-center justify-center gap-x-3 gap-y-0.5 px-5 py-2 text-center text-[13px] font-semibold leading-snug"
        style={{ color: promo.textColor }}
      >
        <span>{textoDeBanner(promo)}</span>
        {conCuenta && fin ? (
          <span className="rounded-full border px-2.5 py-0.5 font-mono text-[12px] tabular-nums" style={{ borderColor: promo.textColor }}>
            {cuentaRegresiva(fin - ahora)}
          </span>
        ) : null}
        <span className="underline underline-offset-2">Ver planes →</span>
      </a>
    </div>
  );
}
