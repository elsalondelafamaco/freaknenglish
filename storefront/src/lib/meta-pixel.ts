import { useEffect, useRef, type RefObject } from "react";
import { publicEnv } from "@/lib/env";

/**
 * Píxel de Meta: mide el embudo de venta para las campañas.
 *
 * Solo corre en el navegador y solo en las páginas públicas. La plataforma por
 * dentro (clases, panel del profe, admin) queda fuera a propósito: si se midiera
 * ahí, el público de "visitantes de la web" se llenaría de los propios alumnos y
 * profes entrando cada día, y se les mostrarían anuncios de lo que ya compraron.
 *
 * Las compras se reportan además desde el servidor (API de Conversiones),
 * porque se pagan en la página de Wompi y no todos vuelven al sitio. Las dos
 * llevan el mismo id —la referencia del pago— para que Meta cuente una sola.
 */

type Fbq = ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[] };

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

/** Rutas de la plataforma por dentro, y las de entrar a ella: no se miden. */
const RUTAS_PRIVADAS = [
  "/app",
  "/teacher",
  "/admin",
  "/boards",
  "/onboarding",
  "/login",
  "/auth",
  "/forgot-password",
  "/reset-password",
];

function esRutaPrivada(pathname: string): boolean {
  return RUTAS_PRIVADAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/**
 * El único punto que decide si se mide. Hoy: hay píxel configurado y la página
 * es pública. Si algún día se pone un aviso de cookies, se engancha aquí y no
 * hay que tocar ningún evento.
 */
export function puedeRastrear(pathname?: string): boolean {
  if (typeof window === "undefined") return false;
  if (!publicEnv.metaPixelId()) return false;
  return !esRutaPrivada(pathname ?? window.location.pathname);
}

let cargado = false;

/**
 * El código base de Meta, cargado una sola vez y a demanda. Es el fragmento
 * oficial, sin el `track('PageView')` que trae de serie: aquí las visitas las
 * dispara el cambio de ruta, porque en una app de una sola página ese fragmento
 * solo vería la primera.
 */
function cargar() {
  if (cargado || typeof window === "undefined") return;
  cargado = true;
  if (!window.fbq) {
    const n: Fbq = function (...args: unknown[]) {
      // eslint-disable-next-line prefer-spread
      (n as any).callMethod ? (n as any).callMethod.apply(n, args) : n.queue!.push(args);
    } as Fbq;
    window.fbq = n;
    if (!window._fbq) window._fbq = n;
    (n as any).push = n;
    (n as any).loaded = true;
    (n as any).version = "2.0";
    // Sin esto el script de Meta engancha `history.pushState` y dispara su
    // propia visita en CADA cambio de ruta: duplicaría las de `rastrearPagina`
    // y mediría también /app y el resto de la plataforma, saltándose la lista
    // de arriba. Verificado en el fbevents.js real (`disablePushState!==!0`).
    (n as any).disablePushState = true;
    n.queue = [];
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
  }
  // Apaga la "configuración automática" (registrar clics en botones y leer los
  // datos de la página por su cuenta). Una vez cargado, el script sigue vivo al
  // entrar a la plataforma y capturaría los clics de los alumnos en clase. Tiene
  // que ir ANTES del `init`.
  window.fbq!("set", "autoConfig", false, publicEnv.metaPixelId());
  window.fbq!("init", publicEnv.metaPixelId());
}

/**
 * Manda un evento estándar. `eventId` se usa en la compra, para que Meta la
 * empareje con la que manda el servidor y no la cuente dos veces.
 */
export function rastrear(evento: string, datos?: Record<string, unknown>, eventId?: string): void {
  if (!puedeRastrear()) return;
  cargar();
  window.fbq!("track", evento, datos ?? {}, eventId ? { eventID: eventId } : undefined);
}

/** Una visita a página. La llama el cambio de ruta, no cada componente. */
export function rastrearPagina(pathname: string): void {
  if (!puedeRastrear(pathname)) return;
  cargar();
  window.fbq!("track", "PageView");
}

/** Las cookies del píxel, para mandarlas con el pago y atribuir la compra. */
export function cookiesDeMeta(): { fbp?: string; fbc?: string } {
  if (typeof document === "undefined") return {};
  const leer = (nombre: string) =>
    document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${nombre}=`))
      ?.slice(nombre.length + 1);
  return { fbp: leer("_fbp"), fbc: leer("_fbc") };
}

/**
 * Dispara un evento UNA vez por visita al paso, cuando los datos ya están
 * (`listo`). El ref evita la segunda vuelta de los efectos en desarrollo y los
 * re-renders: un paso del embudo visto es uno, no tantos como veces se pinte.
 */
export function useRastrearUnaVez(evento: string, datos: () => Record<string, unknown>, listo: boolean): void {
  const hecho = useRef(false);
  useEffect(() => {
    if (!listo || hecho.current) return;
    hecho.current = true;
    rastrear(evento, datos());
    // `datos` se evalúa una sola vez, al disparar: no hace falta en las deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, evento]);
}

/**
 * Igual que `useRastrearUnaVez`, pero cuando el elemento entra en pantalla.
 * Para la sección de precios del inicio: estar en la página no es haber visto
 * los planes, hay que bajar hasta ellos.
 */
export function useRastrearAlVer(
  ref: RefObject<HTMLElement | null>,
  evento: string,
  datos: () => Record<string, unknown>,
  listo: boolean,
): void {
  const hecho = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!listo || hecho.current || !el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entradas) => {
        if (hecho.current || !entradas.some((e) => e.isIntersecting)) return;
        hecho.current = true;
        rastrear(evento, datos());
        obs.disconnect();
      },
      // Cuenta cuando la sección cruza la franja central de la pantalla, no
      // un porcentaje de ella: en celular las tarjetas se apilan y la sección
      // de precios mide más de 3.000 px, así que "que se vea un cuarto" pedía
      // más alto del que tiene la pantalla y no se cumplía nunca. Asomarse por
      // el borde de abajo tampoco cuenta.
      { threshold: 0, rootMargin: "-30% 0px -30% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, evento, ref]);
}

/**
 * La compra, desde el navegador al volver de Wompi. Lleva la referencia del
 * pago como id: es la misma que manda el servidor, y así Meta cuenta UNA.
 *
 * La guarda en `sessionStorage` evita repetirla si recarga la página de
 * retorno; aunque Meta deduplicaría por el id, no tiene sentido mandarla dos
 * veces.
 */
export function rastrearCompra(compra: {
  reference: string;
  planId: string | null;
  amountInCents: number | null;
  currency: string | null;
  esRenovacion: boolean;
}): void {
  if (!puedeRastrear()) return;
  const clave = `freakn.compraReportada.${compra.reference}`;
  try {
    if (window.sessionStorage.getItem(clave)) return;
    window.sessionStorage.setItem(clave, "1");
  } catch {
    /* sin sessionStorage: se manda igual, Meta la deduplica por el id */
  }
  rastrear(
    "Purchase",
    {
      content_type: "product",
      content_ids: compra.planId ? [compra.planId] : [],
      ...(compra.amountInCents != null ? { value: compra.amountInCents / 100 } : {}),
      currency: compra.currency ?? "COP",
      content_category: compra.esRenovacion ? "renovacion" : "plan_nuevo",
    },
    compra.reference,
  );
}
