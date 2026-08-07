import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { IS_ACTIVE_TEACHER } from '../../common/roles'

export interface SlotRef {
  weekday: number
  hour: number
}

export interface ScheduleConfig {
  days: number[]
  startHour: number
  endHour: number
  maxPerDay: number
  durationMin: number
}

const DEFAULT_CONFIG: ScheduleConfig = {
  days: [1, 2, 3, 4, 5],
  // Jornada real de los profes: primera clase 6:00, última 20:00 (termina
  // 20:50). `endHour` es INCLUSIVO, por eso 20 y no 21.
  startHour: 6,
  endHour: 20,
  maxPerDay: 1,
  durationMin: 50,
}

export const PENDING_HOLD_MINUTES = 20
const HOLD_BUSINESS_DAYS = 5

const key = (s: SlotRef) => `${s.weekday}:${s.hour}`

/** Suma n días hábiles (L–V, sin festivos — decisión Q1). */
export function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(from)
  let added = 0
  while (added < n) {
    d.setDate(d.getDate() + 1)
    const wd = d.getDay()
    if (wd !== 0 && wd !== 6) added++
  }
  return d
}

/**
 * Lógica de franjas recurrentes (ScheduleSlot): configuración de la ventana
 * global, matching de disponibilidad SIN exponer profesores, reservas de pago
 * (pending, 20 min), holds de 5 días hábiles y limpieza. Ver docs/SDD-scheduling-v2.md.
 */
@Injectable()
export class SlotsService {
  private readonly log = new Logger(SlotsService.name)
  constructor(private prisma: PrismaService) {}

  // ── Config ──────────────────────────────────────────────────────────
  async getConfig(): Promise<ScheduleConfig> {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { in: ['schedule.days', 'schedule.startHour', 'schedule.endHour', 'schedule.maxPerDay'] } },
    })
    const map = new Map(rows.map((r) => [r.key, r.value as any]))
    const num = (k: string, d: number) => {
      const v = map.get(k)
      const n = typeof v === 'number' ? v : Number((v as any)?.value ?? v)
      return Number.isFinite(n) && n >= 0 ? n : d
    }
    let days = DEFAULT_CONFIG.days
    const rawDays = map.get('schedule.days')
    const arr = Array.isArray(rawDays) ? rawDays : (rawDays as any)?.value
    if (Array.isArray(arr) && arr.length > 0) {
      days = arr.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    }
    return {
      days,
      startHour: num('schedule.startHour', DEFAULT_CONFIG.startHour),
      endHour: num('schedule.endHour', DEFAULT_CONFIG.endHour),
      maxPerDay: Math.max(1, num('schedule.maxPerDay', DEFAULT_CONFIG.maxPerDay)),
      durationMin: DEFAULT_CONFIG.durationMin,
    }
  }

  async updateConfig(body: Partial<Pick<ScheduleConfig, 'days' | 'startHour' | 'endHour' | 'maxPerDay'>>) {
    const set = (k: string, v: unknown) =>
      this.prisma.appSetting.upsert({ where: { key: k }, update: { value: v as any }, create: { key: k, value: v as any } })
    if (body.days !== undefined) await set('schedule.days', body.days)
    if (body.startHour !== undefined) await set('schedule.startHour', body.startHour)
    if (body.endHour !== undefined) await set('schedule.endHour', body.endHour)
    if (body.maxPerDay !== undefined) await set('schedule.maxPerDay', body.maxPerDay)
    return this.getConfig()
  }

  /**
   * Valida una selección contra la ventana global y el plan. `durationMin`
   * (default 50) aplica a planes internos con clases largas: una clase de
   * 75 min ocupa también la hora siguiente, así que no cabe al final de la
   * ventana ni pegada a otra franja del mismo día.
   */
  async validateSelection(slots: SlotRef[], daysPerWeek: number, durationMin = 50): Promise<ScheduleConfig> {
    const cfg = await this.getConfig()
    if (!Array.isArray(slots) || slots.length !== daysPerWeek) {
      throw new BadRequestException(`Debes seleccionar exactamente ${daysPerWeek} franjas`)
    }
    // Horas-celda que abarca cada clase (75 min ⇒ 2 celdas).
    const span = Math.max(1, Math.ceil(durationMin / 60))
    const perDay = new Map<number, number>()
    const seen = new Set<string>()
    for (const s of slots) {
      if (!Number.isInteger(s?.weekday) || !Number.isInteger(s?.hour)) throw new BadRequestException('Franja inválida')
      if (!cfg.days.includes(s.weekday)) throw new BadRequestException('Día fuera de la ventana permitida')
      if (s.hour < cfg.startHour || s.hour > cfg.endHour) throw new BadRequestException('Hora fuera de la ventana permitida')
      if (s.hour + span - 1 > cfg.endHour) {
        throw new BadRequestException(
          `Una clase de ${durationMin} min que empieza a las ${s.hour}:00 se sale de la ventana de horario (última franja ${cfg.endHour}:00)`,
        )
      }
      if (seen.has(key(s))) throw new BadRequestException('Franja repetida')
      seen.add(key(s))
      perDay.set(s.weekday, (perDay.get(s.weekday) ?? 0) + 1)
      if ((perDay.get(s.weekday) ?? 0) > cfg.maxPerDay) {
        throw new BadRequestException(`Máximo ${cfg.maxPerDay} clase(s) por día`)
      }
    }
    if (span > 1) {
      for (const a of slots) {
        for (const b of slots) {
          if (a === b || a.weekday !== b.weekday) continue
          if (Math.abs(a.hour - b.hour) < span) {
            throw new BadRequestException(
              `Las franjas del mismo día deben ir separadas: una clase de ${durationMin} min ocupa también la(s) hora(s) siguiente(s)`,
            )
          }
        }
      }
    }
    return cfg
  }

  // ── Matching (sin exponer profesores) ───────────────────────────────
  /**
   * F(t) = disponibilidad declarada − franjas ocupadas (pending|active|held).
   * Devuelve mapa teacherId → Set("weekday:hour").
   */
  private async freeSlotsByTeacher(excludeStudentId?: string): Promise<Map<string, Set<string>>> {
    // Higiene: las reservas vencidas no deben ocupar franjas ni causar conflictos.
    await this.cleanupExpiredPending()
    // Los intents PENDING del propio estudiante tampoco lo bloquean (renovación/reintento).
    let ownIntentIds: string[] = []
    if (excludeStudentId) {
      const own = await this.prisma.paymentIntent.findMany({
        where: { userId: excludeStudentId, status: 'PENDING' },
        select: { id: true },
      })
      ownIntentIds = own.map((o) => o.id)
    }
    const [teachers, occupied] = await Promise.all([
      this.prisma.user.findMany({
        where: IS_ACTIVE_TEACHER,
        include: { availability: true },
      }),
      this.prisma.scheduleSlot.findMany({
        // Las franjas del propio estudiante (renovación) cuentan como libres para él.
        where: {
          status: { in: ['pending', 'active', 'held'] },
          ...(excludeStudentId
            ? {
                NOT: {
                  OR: [
                    { studentId: excludeStudentId },
                    ...(ownIntentIds.length ? [{ intentId: { in: ownIntentIds } }] : []),
                  ],
                },
              }
            : {}),
        },
        select: {
          teacherId: true,
          weekday: true,
          hour: true,
          // Un estudiante con clase larga (ej. 75 min) ocupa también la(s)
          // hora(s) siguiente(s) aunque el slot solo viva en la hora de inicio.
          student: { select: { classDurationMin: true } },
        },
      }),
    ])
    const occ = new Map<string, Set<string>>()
    for (const o of occupied) {
      if (!occ.has(o.teacherId)) occ.set(o.teacherId, new Set())
      const span = Math.max(1, Math.ceil((o.student?.classDurationMin ?? 50) / 60))
      for (let i = 0; i < span; i++) {
        occ.get(o.teacherId)!.add(`${o.weekday}:${o.hour + i}`)
      }
    }
    const free = new Map<string, Set<string>>()
    for (const t of teachers) {
      const set = new Set<string>()
      for (const a of t.availability) {
        const s = parseInt(a.startsAt.split(':')[0] ?? '0', 10)
        const e = parseInt(a.endsAt.split(':')[0] ?? '0', 10)
        for (let h = s; h < e; h++) {
          const k = `${a.weekday}:${h}`
          if (!occ.get(t.id)?.has(k)) set.add(k)
        }
      }
      free.set(t.id, set)
    }
    return free
  }

  /** Profes que cubren TODA la selección, ordenados por menor carga. */
  async candidateTeachers(slots: SlotRef[], excludeStudentId?: string): Promise<string[]> {
    const free = await this.freeSlotsByTeacher(excludeStudentId)
    const loads = await this.prisma.scheduleSlot.groupBy({
      by: ['teacherId'],
      where: { status: { in: ['active', 'held'] } },
      _count: { _all: true },
    })
    const load = new Map(loads.map((l) => [l.teacherId, l._count._all]))
    const out: string[] = []
    for (const [tid, set] of free) {
      if (slots.every((s) => set.has(key(s)))) out.push(tid)
    }
    out.sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0) || a.localeCompare(b))
    return out
  }

  /**
   * Hints del picker: por franja, ¿algún profe compatible con la selección
   * actual la tiene libre? Solo booleanos — jamás datos de profesores (AC-6).
   */
  async hints(selection: SlotRef[], excludeStudentId?: string): Promise<{ assignable: boolean; hints: Array<SlotRef & { auto: boolean }> }> {
    const cfg = await this.getConfig()
    const free = await this.freeSlotsByTeacher(excludeStudentId)
    const sel = (selection ?? []).filter((s) => Number.isInteger(s?.weekday) && Number.isInteger(s?.hour))
    const compatible = Array.from(free.entries()).filter(([, set]) => sel.every((s) => set.has(key(s))))
    const union = new Set<string>()
    for (const [, set] of compatible) for (const k of set) union.add(k)
    const hints: Array<SlotRef & { auto: boolean }> = []
    for (const d of cfg.days) {
      for (let h = cfg.startHour; h <= cfg.endHour; h++) {
        hints.push({ weekday: d, hour: h, auto: union.has(`${d}:${h}`) })
      }
    }
    return { assignable: compatible.length > 0, hints }
  }

  // ── Reserva de pago (pending, 20 min) ───────────────────────────────
  /**
   * Reserva las franjas con el mejor candidato. Devuelve modo y (interno)
   * el profe reservado. Conflicto → siguiente candidato → manual.
   */
  async reserveForIntent(intentId: string, slots: SlotRef[], studentId?: string): Promise<{ mode: 'auto' | 'manual'; teacherId?: string }> {
    const candidates = await this.candidateTeachers(slots, studentId)
    const holdExpiresAt = new Date(Date.now() + PENDING_HOLD_MINUTES * 60 * 1000)
    const own = studentId
      ? await this.prisma.scheduleSlot.findMany({
          where: { studentId, status: { in: ['active', 'held'] } },
          select: { teacherId: true, weekday: true, hour: true },
        })
      : []
    for (const teacherId of candidates) {
      // Franjas que el propio estudiante ya ocupa con ESTE profe no necesitan pending.
      const ownKeys = new Set(own.filter((o) => o.teacherId === teacherId).map((o) => `${o.weekday}:${o.hour}`))
      const toReserve = slots.filter((s) => !ownKeys.has(`${s.weekday}:${s.hour}`))
      try {
        if (toReserve.length > 0) {
          await this.prisma.$transaction(
            toReserve.map((s) =>
              this.prisma.scheduleSlot.create({
                data: { teacherId, intentId, weekday: s.weekday, hour: s.hour, status: 'pending', holdExpiresAt },
              }),
            ),
          )
        }
        return { mode: 'auto', teacherId }
      } catch (e) {
        // Carrera: franja tomada entre el cálculo y la reserva → probar siguiente.
        await this.prisma.scheduleSlot.deleteMany({ where: { intentId, status: 'pending' } }).catch(() => null)
      }
    }
    return { mode: 'manual' }
  }

  /** Suelta las reservas pending de intents anteriores del mismo comprador. */
  async releasePreviousPendings(customerEmail: string, userId?: string) {
    const prev = await this.prisma.paymentIntent.findMany({
      where: {
        status: 'PENDING',
        OR: [
          { customerEmail: { equals: customerEmail, mode: 'insensitive' } },
          ...(userId ? [{ userId }] : []),
        ],
      },
      select: { id: true },
    })
    if (prev.length === 0) return
    await this.prisma.scheduleSlot.deleteMany({
      where: { status: 'pending', intentId: { in: prev.map((p) => p.id) } },
    })
  }

  async releasePendingForIntent(intentId: string) {
    await this.prisma.scheduleSlot.deleteMany({ where: { intentId, status: 'pending' } })
  }

  async cleanupExpiredPending() {
    const r = await this.prisma.scheduleSlot.deleteMany({
      where: { status: 'pending', holdExpiresAt: { lt: new Date() } },
    })
    if (r.count > 0) this.log.log(`Released ${r.count} expired pending slot(s)`)
  }

  // ── Holds de vencimiento (5 días hábiles) ───────────────────────────
  /** active → held para estudiantes con suscripción no activa. */
  async holdSlotsForExpired() {
    const active = await this.prisma.scheduleSlot.findMany({
      where: { status: 'active', studentId: { not: null } },
      select: { studentId: true },
      distinct: ['studentId'],
    })
    for (const { studentId } of active) {
      if (!studentId) continue
      const sub = await this.prisma.subscription.findUnique({ where: { userId: studentId } })
      if (sub?.status === 'active') continue
      const base = sub?.currentPeriodEnd ?? new Date()
      const holdExpiresAt = addBusinessDays(base, HOLD_BUSINESS_DAYS)
      await this.prisma.scheduleSlot.updateMany({
        where: { studentId, status: 'active' },
        data: { status: 'held', holdExpiresAt },
      })
      this.log.log(`Held slots for expired student ${studentId} until ${holdExpiresAt.toISOString()}`)
    }
  }

  /** Libera holds vencidos y cancela las clases futuras de esos estudiantes. */
  async releaseExpiredHolds(): Promise<string[]> {
    const expired = await this.prisma.scheduleSlot.findMany({
      where: { status: 'held', holdExpiresAt: { lt: new Date() } },
      select: { id: true, studentId: true },
    })
    if (expired.length === 0) return []
    const ids = expired.map((e) => e.id)
    const studentIds = Array.from(new Set(expired.map((e) => e.studentId).filter(Boolean))) as string[]
    await this.prisma.scheduleSlot.deleteMany({ where: { id: { in: ids } } })
    await this.prisma.class.updateMany({
      where: { studentId: { in: studentIds }, status: 'scheduled', startsAt: { gt: new Date() } },
      data: { status: 'cancelled' },
    })
    this.log.log(`Released holds of ${studentIds.length} student(s); future classes cancelled`)
    return studentIds
  }

  // ── Utilidades ──────────────────────────────────────────────────────
  async slotsOfStudent(studentId: string) {
    return this.prisma.scheduleSlot.findMany({
      where: { studentId, status: { in: ['active', 'held'] } },
      orderBy: [{ weekday: 'asc' }, { hour: 'asc' }],
    })
  }

  /**
   * Backfill perezoso (decisión Q6): estudiantes con profe + preferencias pero
   * sin ScheduleSlots → se crean como active. Idempotente; corre en tick diario.
   */
  async backfillFromPreferences() {
    const students = await this.prisma.user.findMany({
      where: {
        role: 'student',
        deletedAt: null,
        assignedTeacherId: { not: null },
        studentSlots: { none: {} },
      },
      select: { id: true, assignedTeacherId: true, schedulePreferences: true, subscription: { select: { status: true, currentPeriodEnd: true } } },
    })
    for (const u of students) {
      const blocks = (u.schedulePreferences as any as SlotRef[] | null) ?? []
      if (!Array.isArray(blocks) || blocks.length === 0) continue
      const isActive = u.subscription?.status === 'active'
      const status = isActive ? 'active' : 'held'
      const holdExpiresAt = isActive ? null : addBusinessDays(u.subscription?.currentPeriodEnd ?? new Date(), HOLD_BUSINESS_DAYS)
      for (const b of blocks) {
        if (!Number.isInteger(b?.weekday) || !Number.isInteger(b?.hour)) continue
        await this.prisma.scheduleSlot
          .create({ data: { teacherId: u.assignedTeacherId!, studentId: u.id, weekday: b.weekday, hour: b.hour, status, holdExpiresAt } })
          .catch(() => null) // conflicto: franja ya ocupada — se resuelve manualmente
      }
      this.log.log(`Backfilled slots for student ${u.id}`)
    }
  }
}
