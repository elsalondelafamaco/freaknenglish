import { BadRequestException } from '@nestjs/common'
import type { ScheduleConfig } from './slots.service'

/** Colombia no tiene horario de verano: el offset es fijo. */
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000

const NOMBRE_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** Día de la semana y hora de un instante, leídos en hora de Bogotá. */
export function partesBogota(d: Date): { weekday: number; hour: number } {
  const local = new Date(d.getTime() - BOGOTA_OFFSET_MS)
  return { weekday: local.getUTCDay(), hour: local.getUTCHours() }
}

/**
 * Valida que una clase caiga dentro de la ventana operativa (días y horas
 * configurados en `app_settings`, por defecto lunes a viernes de 6 a 20).
 *
 * Nace de un caso real: al reprogramar se escribió 8 de agosto en vez de 18, el
 * 8 caía sábado y la clase se movió sin chistar. Después era imposible tocarla
 * desde el calendario del profe, porque ese calendario oculta sábado y domingo
 * — la clase quedaba en el limbo. Además los fines de semana no entran a
 * nómina, así que por política no se dictan.
 *
 * Se valida el inicio Y el fin: una clase de 75 min que empieza a las 20:00 se
 * sale de la ventana aunque el inicio sea válido.
 */
export function assertDentroDeLaVentana(startsAt: Date, endsAt: Date, cfg: ScheduleConfig): void {
  const ini = partesBogota(startsAt)
  if (!cfg.days.includes(ini.weekday)) {
    const permitidos = cfg.days.map((d) => NOMBRE_DIA[d]).join(', ')
    throw new BadRequestException(
      `No se pueden agendar clases en ${NOMBRE_DIA[ini.weekday]}. Días habilitados: ${permitidos}.`,
    )
  }
  if (ini.hour < cfg.startHour || ini.hour > cfg.endHour) {
    throw new BadRequestException(
      `La hora ${ini.hour}:00 está fuera de la ventana de clases (${cfg.startHour}:00 a ${cfg.endHour}:00).`,
    )
  }
  // El fin se mide un minuto antes para que una clase que termina en punto
  // (20:50 → 20:50) no se considere fuera por el borde.
  const fin = partesBogota(new Date(endsAt.getTime() - 60_000))
  if (fin.weekday !== ini.weekday || fin.hour > cfg.endHour) {
    throw new BadRequestException(
      `La clase se sale de la ventana de horario (última franja ${cfg.endHour}:00).`,
    )
  }
}
