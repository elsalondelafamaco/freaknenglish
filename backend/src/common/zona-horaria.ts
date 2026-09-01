/**
 * Zonas horarias, sin dependencias.
 *
 * GEMELO EXACTO de `storefront/src/lib/domain/zona-horaria.ts`. El backend es
 * commonjs y el storefront ESM, y no hay paquete compartido entre los dos;
 * montar uno obligaría a tocar la compilación de Nest, la de Vite, los dos
 * tsconfig y el despliegue, para un archivo sin imports que no va a cambiar.
 * Si tocas este, toca el otro.
 *
 * Regla de oro: SIEMPRE identificadores IANA, nunca un desfase en horas.
 * Colombia no cambia de hora y Estados Unidos sí, así que el desfase entre
 * Bogotá y San Francisco es de 2 horas en verano y de 3 en invierno. Un número
 * guardado se equivoca medio año y no deja forma de recuperar la verdad.
 */

export const ZONA_BOGOTA = 'America/Bogota'

/** `true` si el runtime reconoce la zona. Un valor corrupto en base no puede tumbar un correo. */
export function esZonaValida(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(0))
    return true
  } catch {
    return false
  }
}

/** La zona del usuario si es usable; si no, Bogotá. */
export function zonaDe(tz?: string | null): string {
  return tz && esZonaValida(tz) ? tz : ZONA_BOGOTA
}

/** Un instante real, escrito en la zona de quien lo va a leer. */
export function formatearInstante(
  iso: string | Date,
  zona?: string | null,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'full', timeStyle: 'short' },
): string {
  return new Date(iso).toLocaleString('es-CO', { ...opts, timeZone: zonaDe(zona) })
}

/** "GMT-5" / "GMT-7". Se calcula contra una fecha concreta porque cambia con el horario de verano. */
export function etiquetaDeZona(zona?: string | null, ref: Date = new Date()): string {
  const z = zonaDe(zona)
  try {
    const partes = new Intl.DateTimeFormat('en-US', { timeZone: z, timeZoneName: 'shortOffset' }).formatToParts(ref)
    return partes.find((p) => p.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}

/** Nombre legible de la zona: "Los Ángeles" a partir de "America/Los_Angeles". */
export function nombreDeZona(zona?: string | null): string {
  const z = zonaDe(zona)
  return (z.split('/').pop() ?? z).replace(/_/g, ' ')
}

/**
 * Instante de la PRÓXIMA vez que ocurre una franja `(weekday, hour)` de Bogotá.
 *
 * Hace falta porque una franja semanal no tiene fecha, y sin fecha no hay
 * desfase: las 11:00 de Bogotá son sus 09:00 en octubre y sus 08:00 en
 * noviembre. Se ancla en la próxima ocurrencia, que es la que va a vivir.
 */
function proximaOcurrencia(weekday: number, hour: number, ahora: Date = new Date()): Date {
  const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000
  const enBogota = new Date(ahora.getTime() - BOGOTA_OFFSET_MS)
  const base = Date.UTC(enBogota.getUTCFullYear(), enBogota.getUTCMonth(), enBogota.getUTCDate())
  const diff = (weekday - new Date(base).getUTCDay() + 7) % 7
  return new Date(base + diff * 86_400_000 + hour * 3_600_000 + BOGOTA_OFFSET_MS)
}

/**
 * Cómo se lee en `zona` una franja fija de Bogotá.
 *
 * `cruzaDia`: -1 si allí es el día anterior, +1 si es el siguiente. Importa: en
 * Tokio, el lunes a las 20:00 de Colombia es MARTES a las 10:00. Sin esa marca,
 * la cabecera del día de la grilla estaría mintiendo.
 */
export function franjaEnZona(
  weekday: number,
  hour: number,
  zona?: string | null,
): { weekday: number; hour: number; minuto: number; cruzaDia: -1 | 0 | 1 } {
  const z = zonaDe(zona)
  if (z === ZONA_BOGOTA) return { weekday, hour, minuto: 0, cruzaDia: 0 }

  const instante = proximaOcurrencia(weekday, hour)
  try {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: z,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(instante)
    const de = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0)
    const local = Date.UTC(de('year'), de('month') - 1, de('day'))

    // El mismo cálculo para Bogotá, y la diferencia de días entre ambos.
    const b = new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA_BOGOTA,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instante)
    const deB = (t: string) => Number(b.find((x) => x.type === t)?.value ?? 0)
    const bogota = Date.UTC(deB('year'), deB('month') - 1, deB('day'))

    const dias = Math.round((local - bogota) / 86_400_000)
    return {
      weekday: new Date(local).getUTCDay(),
      hour: de('hour'),
      minuto: de('minute'),
      cruzaDia: (dias > 0 ? 1 : dias < 0 ? -1 : 0) as -1 | 0 | 1,
    }
  } catch {
    return { weekday, hour, minuto: 0, cruzaDia: 0 }
  }
}
