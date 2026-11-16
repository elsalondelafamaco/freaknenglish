/**
 * Fechas de clase para el portal del estudiante.
 *
 * Todo se lee en la zona del estudiante (si la tiene guardada) o, si no, en la
 * del navegador, que es lo que ya hacían las pantallas con `toLocaleString`.
 * Las horas salen como se leen en Colombia: "7:00 a. m.".
 */
import { esZonaValida, horaEn12 } from "./zona-horaria";

export const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
export const DIAS_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
export const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;
export const MESES_LARGO = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

/** La zona solo cuenta si el runtime la reconoce; si no, se usa la del navegador. */
const zonaUsable = (zona?: string | null) => (zona && esZonaValida(zona) ? zona : undefined);

export type Partes = { y: number; m: number; d: number; hora: number; min: number; dow: number };

/** Año, mes, día, hora y día de la semana de un instante, en la zona dada. */
export function partesDe(iso: string | Date, zona?: string | null): Partes {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: zonaUsable(zona),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const n = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  const y = n("year");
  const m = n("month");
  const d = n("day");
  return { y, m, d, hora: n("hour"), min: n("minute"), dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

const dos = (n: number) => String(n).padStart(2, "0");

/** Clave de día "2026-11-17" en la zona dada. Sirve para agrupar y comparar. */
export const claveDia = (iso: string | Date, zona?: string | null): string => {
  const p = partesDe(iso, zona);
  return `${p.y}-${dos(p.m)}-${dos(p.d)}`;
};

/** Suma días a una clave de día (calendario puro, sin zonas de por medio). */
export function sumarDias(clave: string, dias: number): string {
  const [y, m, d] = clave.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + dias));
  return `${t.getUTCFullYear()}-${dos(t.getUTCMonth() + 1)}-${dos(t.getUTCDate())}`;
}

/** Partes de calendario de una clave de día. */
export function partesDeClave(clave: string) {
  const [y, m, d] = clave.split("-").map(Number);
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** Lunes de la semana a la que pertenece la clave de día. */
export function lunesDe(clave: string): string {
  const { dow } = partesDeClave(clave);
  return sumarDias(clave, -((dow + 6) % 7));
}

/** "7:00 a. m." */
export function horaDeClase(iso: string | Date, zona?: string | null): string {
  const p = partesDe(iso, zona);
  return horaEn12(p.hora, p.min);
}

/** "Lun 17" */
export function diaCorto(iso: string | Date, zona?: string | null): string {
  const p = partesDe(iso, zona);
  return `${DIAS_CORTO[p.dow]} ${p.d}`;
}

/** "lunes 17 de noviembre" */
export function diaLargo(iso: string | Date, zona?: string | null): string {
  const p = partesDe(iso, zona);
  return `${DIAS_LARGO[p.dow]} ${p.d} de ${MESES_LARGO[p.m - 1]}`;
}

/** "Hoy", "Mañana" o null si cae más lejos. */
export function diaRelativo(iso: string | Date, zona?: string | null, ahora: Date = new Date()): "Hoy" | "Mañana" | null {
  const k = claveDia(iso, zona);
  const hoy = claveDia(ahora, zona);
  if (k === hoy) return "Hoy";
  if (k === sumarDias(hoy, 1)) return "Mañana";
  return null;
}

/** "17 nov" */
export function diaMes(iso: string | Date, zona?: string | null): string {
  const p = partesDe(iso, zona);
  return `${p.d} ${MESES_CORTO[p.m - 1]}`;
}

/** Duración real de la clase en minutos (endsAt − startsAt); 50 si no calcula. */
export const duracionMin = (c: { startsAt: string; endsAt?: string }): number => {
  const d = Math.round((new Date(c.endsAt ?? c.startsAt).getTime() - new Date(c.startsAt).getTime()) / 60_000);
  return d > 0 ? d : 50;
};

/**
 * "Profe Laura Gómez". Si el nombre ya trae el "Profe" (hay cuentas así), no se
 * repite: antes salía "Profe Profe Demo".
 */
export function conProfe(nombre: string): string {
  return /^profe\b/i.test(nombre.trim()) ? nombre.trim() : `Profe ${nombre.trim()}`;
}

/** Iniciales de un nombre: "Laura Gómez" → "LG". */
export function iniciales(nombre?: string | null): string {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "–";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}
