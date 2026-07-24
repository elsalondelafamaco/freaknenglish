import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { BoardService } from '../board/board.service'
import { SlotsService, SlotRef } from './slots.service'

/**
 * Bloques semanales de horario del estudiante.
 * weekday: 0=Dom..6=Sáb ; hour: 24h (7..21 típico), en hora local Bogotá.
 */
export interface ScheduleBlock {
  weekday: number
  hour: number
}

// Colombia no tiene horario de verano: siempre UTC-5.
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000
const CLASS_DURATION_MIN = 50
// Horizonte de clases generadas por adelantado.
const GENERATION_WEEKS = 4

function isHourInRange(hour: number, startsAt: string, endsAt: string) {
  const s = parseInt(startsAt.split(':')[0] ?? '0', 10)
  const e = parseInt(endsAt.split(':')[0] ?? '0', 10)
  return hour >= s && hour < e
}

@Injectable()
export class SchedulingService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private boards: BoardService,
    private slots: SlotsService,
  ) {}

  private async notifyTeacherAssigned(studentId: string, teacherId: string, dedupeSuffix: string) {
    const [student, teacher] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: studentId } }),
      this.prisma.user.findUnique({ where: { id: teacherId } }),
    ])
    if (!student || !teacher) return
    await this.notifications.enqueue({
      userId: student.id,
      toEmail: student.email,
      template: 'teacher_assigned',
      subject: 'Tienes un nuevo profesor',
      dedupeKey: `teacher-assigned:${student.id}:${teacher.id}:${dedupeSuffix}`,
      vars: { teacherName: teacher.fullName },
      type: 'teacher',
      title: 'Nuevo profesor asignado',
      body: teacher.fullName,
      linkUrl: '/app',
    })
  }

  /**
   * Convierte (weekday, hour local Bogotá, semanas de offset) en el instante
   * real (UTC) de la clase.
   */
  private buildClassInstant(weekday: number, hour: number, weekOffset: number): Date {
    const nowLocal = new Date(Date.now() - BOGOTA_OFFSET_MS) // leer campos UTC como hora Bogotá
    const y = nowLocal.getUTCFullYear()
    const m = nowLocal.getUTCMonth()
    const d = nowLocal.getUTCDate()
    const curWeekday = nowLocal.getUTCDay()
    let deltaDays = (weekday - curWeekday + 7) % 7
    deltaDays += weekOffset * 7
    const wallMs = Date.UTC(y, m, d + deltaDays, hour, 0, 0)
    return new Date(wallMs + BOGOTA_OFFSET_MS)
  }

  /**
   * Materializa las clases recurrentes del estudiante para las próximas
   * GENERATION_WEEKS semanas a partir de sus `schedulePreferences` y su
   * profesor asignado. Idempotente: no duplica clases en el mismo instante.
   * Es la fuente de las clases que ve el calendario y que alimenta la nómina.
   */
  async ensureUpcomingClasses(studentId: string): Promise<{ created: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
      include: { subscription: true },
    })
    if (!user || !user.assignedTeacherId) return { created: 0 }
    if (!user.subscription || user.subscription.status !== 'active') return { created: 0 }
    // Fuente de verdad: ScheduleSlots activos; fallback legacy a preferencias.
    const slotRows = await this.prisma.scheduleSlot.findMany({
      where: { studentId, status: 'active' },
      select: { weekday: true, hour: true },
    })
    const blocks: ScheduleBlock[] = slotRows.length > 0
      ? slotRows
      : ((user.schedulePreferences as any as ScheduleBlock[] | null) ?? [])
    if (!Array.isArray(blocks) || blocks.length === 0) return { created: 0 }

    // Aula colaborativa compartida (board en vivo) para el par profe-estudiante.
    const classroom = await this.boards.ensureClassroom(user.assignedTeacherId, studentId)
    const meetingUrl = `/boards/${classroom.id}`

    const now = new Date()
    let created = 0
    for (const b of blocks) {
      if (typeof b?.weekday !== 'number' || typeof b?.hour !== 'number') continue
      for (let w = 0; w < GENERATION_WEEKS; w++) {
        const startsAt = this.buildClassInstant(b.weekday, b.hour, w)
        if (startsAt.getTime() <= now.getTime()) continue
        const exists = await this.prisma.class.findFirst({
          where: { studentId, startsAt },
          select: { id: true },
        })
        if (exists) continue
        // Evita doble-reserva del profesor en el mismo instante (1-on-1).
        const teacherBusy = await this.prisma.class.findFirst({
          where: { teacherId: user.assignedTeacherId, startsAt, status: { in: ['scheduled', 'rescheduled', 'validated'] } },
          select: { id: true },
        })
        if (teacherBusy) continue
        const endsAt = new Date(startsAt.getTime() + CLASS_DURATION_MIN * 60 * 1000)
        await this.prisma.class.create({
          data: {
            studentId,
            teacherId: user.assignedTeacherId,
            startsAt,
            endsAt,
            status: 'scheduled',
            meetingUrl,
          },
        })
        created++
      }
    }
    return { created }
  }

  /**
   * Grilla 7×24 (weekday × hour) → cantidad de profesores con disponibilidad.
   * Sólo profesores activos (no deshabilitados/eliminados).
   */
  async availabilityGrid() {
    const avail = await this.prisma.teacherAvailability.findMany({
      include: { teacher: { select: { disabledAt: true, deletedAt: true } } },
    })
    const grid: Record<string, number> = {}
    for (const a of avail) {
      if (a.teacher.disabledAt || a.teacher.deletedAt) continue
      const s = parseInt(a.startsAt.split(':')[0] ?? '0', 10)
      const e = parseInt(a.endsAt.split(':')[0] ?? '0', 10)
      for (let h = s; h < e; h++) {
        const key = `${a.weekday}:${h}`
        grid[key] = (grid[key] ?? 0) + 1
      }
    }
    return { grid, hours: Array.from({ length: 15 }, (_, i) => i + 7) } // 7..21
  }

  /**
   * Recibe N bloques (== plan.daysPerWeek), busca UN profesor con
   * disponibilidad para TODOS. Si encuentra: assignedTeacherId + status
   * `auto_assigned` y genera las clases. Si no: `manual_pending`.
   */
  async submitPreferences(userId: string, blocks: ScheduleBlock[]) {
    if (!Array.isArray(blocks) || blocks.length === 0) throw new BadRequestException('blocks required')
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: { include: { plan: true } } },
    })
    if (!user) throw new NotFoundException('User not found')
    if (!user.subscription || user.subscription.status !== 'active') {
      throw new BadRequestException('Active subscription required')
    }
    const expected = user.subscription.plan.daysPerWeek
    // Valida cantidad, ventana global y máximo por día (config admin).
    await this.slots.validateSelection(blocks, expected)

    // Buscar profesor que cubra todos los bloques.
    const teachers = await this.prisma.user.findMany({
      where: { role: 'teacher', disabledAt: null, deletedAt: null },
      include: { availability: true },
    })
    const match = teachers.find((t) =>
      blocks.every((b) =>
        t.availability.some((a) => a.weekday === b.weekday && isHourInRange(b.hour, a.startsAt, a.endsAt)),
      ),
    )

    let effectiveMatch = match ?? null
    if (effectiveMatch) {
      const holdRelease = await this.prisma.scheduleSlot.deleteMany({ where: { studentId: userId } })
      void holdRelease
      try {
        await this.prisma.$transaction(
          blocks.map((b) =>
            this.prisma.scheduleSlot.create({
              data: { teacherId: effectiveMatch!.id, studentId: userId, weekday: b.weekday, hour: b.hour, status: 'active' },
            }),
          ),
        )
      } catch {
        effectiveMatch = null // franja ocupada: degradar a manual
      }
    }
    const status = effectiveMatch ? 'auto_assigned' : 'manual_pending'
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        schedulePreferences: blocks as any,
        scheduleAssignmentStatus: status,
        assignedTeacherId: effectiveMatch?.id ?? user.assignedTeacherId ?? null,
        onboardedAt: user.onboardedAt ?? new Date(),
      },
    })
    if (effectiveMatch) {
      await this.notifyTeacherAssigned(userId, effectiveMatch.id, 'onboarding')
      await this.ensureUpcomingClasses(userId)
    }

    return {
      status,
      teacher: effectiveMatch ? { id: effectiveMatch.id, fullName: effectiveMatch.fullName } : null,
      blocks,
    }
  }

  /** Estado del onboarding del estudiante autenticado. */
  async mySchedule(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        schedulePreferences: true,
        scheduleAssignmentStatus: true,
        assignedTeacherId: true,
        assignedTeacher: { select: { id: true, fullName: true } },
      },
    })
    const slots = await this.slots.slotsOfStudent(userId)
    return { ...u, slots }
  }

  // ── Admin ──────────────────────────────────────────────────────────

  /** Calendario global: clases de todos los profesores (solo lectura, AC-26). */
  async adminCalendar(from: Date, to: Date) {
    const classes = await this.prisma.class.findMany({
      where: { startsAt: { gte: from, lt: to }, teacherId: { not: null } },
      include: {
        teacher: { select: { id: true, fullName: true } },
        student: { select: { id: true, fullName: true, subscription: { select: { status: true } } } },
      },
      orderBy: { startsAt: 'asc' },
    })
    const teachers = await this.prisma.user.findMany({
      where: { role: 'teacher', deletedAt: null },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    })
    return {
      teachers,
      classes: classes.map((c) => ({
        id: c.id,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        status: c.status,
        teacher: c.teacher,
        student: {
          id: c.student.id,
          fullName: c.student.fullName,
          paymentActive: c.student.subscription?.status === 'active',
        },
      })),
    }
  }

  async pendingRequests() {
    return this.prisma.user.findMany({
      where: { scheduleAssignmentStatus: 'manual_pending', deletedAt: null },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        englishLevel: true,
        schedulePreferences: true,
        subscription: { select: { plan: { select: { name: true, daysPerWeek: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    })
  }

  async assignRequest(studentId: string, teacherId: string) {
    const t = await this.prisma.user.findUnique({ where: { id: teacherId } })
    if (!t || t.role !== 'teacher') throw new BadRequestException('Invalid teacher')
    const student = await this.prisma.user.findUnique({ where: { id: studentId }, select: { schedulePreferences: true } })
    const blocks = (student?.schedulePreferences as any as ScheduleBlock[] | null) ?? []
    if (blocks.length > 0) {
      const conflicts = await this.prisma.scheduleSlot.findMany({
        where: {
          teacherId,
          status: { in: ['pending', 'active', 'held'] },
          OR: blocks.map((b) => ({ weekday: b.weekday, hour: b.hour })),
          NOT: { studentId },
        },
        select: { weekday: true, hour: true },
      })
      if (conflicts.length > 0) {
        throw new BadRequestException(
          `El profesor ya tiene ocupadas: ${conflicts.map((c) => `d${c.weekday} ${c.hour}:00`).join(', ')}`,
        )
      }
      await this.prisma.scheduleSlot.deleteMany({ where: { studentId } })
      await this.prisma.$transaction(
        blocks.map((b) =>
          this.prisma.scheduleSlot.create({
            data: { teacherId, studentId, weekday: b.weekday, hour: b.hour, status: 'active' },
          }),
        ),
      )
    }
    const updated = await this.prisma.user.update({
      where: { id: studentId },
      data: { assignedTeacherId: teacherId, scheduleAssignmentStatus: 'auto_assigned' },
    })
    await this.notifyTeacherAssigned(studentId, teacherId, 'manual')
    await this.ensureUpcomingClasses(studentId)
    return updated
  }

  async getTeacherAvailability(teacherId: string) {
    return this.prisma.teacherAvailability.findMany({ where: { teacherId }, orderBy: [{ weekday: 'asc' }, { startsAt: 'asc' }] })
  }

  async setTeacherAvailability(teacherId: string, slots: Array<{ weekday: number; startsAt: string; endsAt: string }>) {
    await this.prisma.teacherAvailability.deleteMany({ where: { teacherId } })
    if (slots.length === 0) return []
    await this.prisma.teacherAvailability.createMany({
      data: slots.map((s) => ({ teacherId, weekday: s.weekday, startsAt: s.startsAt, endsAt: s.endsAt })),
    })
    return this.getTeacherAvailability(teacherId)
  }

  /**
   * Re-evalúa a los estudiantes con `manual_pending`: si los nuevos
   * bloques del profesor cubren TODAS sus preferencias, los auto-asigna
   * y genera sus clases. Devuelve el listado de estudiantes reasignados.
   */
  async reassignPendingForTeacher(teacherId: string) {
    const teacher = await this.prisma.user.findUnique({
      where: { id: teacherId },
      include: { availability: true },
    })
    if (!teacher || teacher.role !== 'teacher' || teacher.disabledAt || teacher.deletedAt) return []

    const pending = await this.prisma.user.findMany({
      where: { scheduleAssignmentStatus: 'manual_pending', deletedAt: null },
      select: { id: true, fullName: true, schedulePreferences: true },
    })

    const reassigned: Array<{ id: string; fullName: string }> = []
    for (const s of pending) {
      const blocks = (s.schedulePreferences as any as ScheduleBlock[] | null) ?? []
      if (blocks.length === 0) continue
      const covers = blocks.every((b) =>
        teacher.availability.some(
          (a) => a.weekday === b.weekday && isHourInRange(b.hour, a.startsAt, a.endsAt),
        ),
      )
      if (!covers) continue
      try {
        await this.prisma.scheduleSlot.deleteMany({ where: { studentId: s.id } })
        await this.prisma.$transaction(
          blocks.map((b) =>
            this.prisma.scheduleSlot.create({
              data: { teacherId, studentId: s.id, weekday: b.weekday, hour: b.hour, status: 'active' },
            }),
          ),
        )
      } catch {
        continue // franja ocupada por otro slot: sigue pendiente
      }
      await this.prisma.user.update({
        where: { id: s.id },
        data: {
          assignedTeacherId: teacherId,
          scheduleAssignmentStatus: 'auto_assigned',
        },
      })
      await this.notifyTeacherAssigned(s.id, teacherId, 'reassign')
      await this.ensureUpcomingClasses(s.id)
      reassigned.push({ id: s.id, fullName: s.fullName })
    }
    return reassigned
  }

  // ── Admin: cambio de profesor con migración completa ────────────────
  private static readonly DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

  /**
   * Reasigna al estudiante a otro profesor moviendo TODO su estado:
   * slots recurrentes, clases futuras, aula (board) y espejo de preferencias.
   * Si el nuevo profe tiene ocupada alguna franja del estudiante (horario
   * cruzado), falla con el detalle para que el admin lo resuelva primero.
   */
  async adminReassignTeacher(studentId: string, newTeacherId: string | null) {
    const slots = await this.prisma.scheduleSlot.findMany({
      where: { studentId, status: { in: ['active', 'held'] } },
    })

    if (!newTeacherId) {
      // Quitar profesor: libera franjas y cancela clases futuras.
      await this.prisma.scheduleSlot.deleteMany({ where: { studentId } })
      await this.prisma.class.updateMany({
        where: { studentId, status: 'scheduled', startsAt: { gt: new Date() } },
        data: { status: 'cancelled' },
      })
      await this.prisma.user.update({
        where: { id: studentId },
        data: { assignedTeacherId: null, scheduleAssignmentStatus: 'manual_pending' },
      })
      return { unassigned: true, movedSlots: 0, movedClasses: 0 }
    }

    // Horarios cruzados: franjas del estudiante ya ocupadas por el nuevo profe.
    if (slots.length > 0) {
      const conflicts = await this.prisma.scheduleSlot.findMany({
        where: {
          teacherId: newTeacherId,
          status: { in: ['pending', 'active', 'held'] },
          OR: slots.map((b) => ({ weekday: b.weekday, hour: b.hour })),
          NOT: { studentId },
        },
        select: { weekday: true, hour: true },
      })
      if (conflicts.length > 0) {
        const detail = conflicts
          .map((c) => `${SchedulingService.DAY_NAMES[c.weekday]} ${c.hour}:00`)
          .join(', ')
        throw new BadRequestException(
          `Horario cruzado: el nuevo profesor ya tiene ocupado ${detail}. Reprograma esas franjas antes de reasignar.`,
        )
      }
      await this.prisma.scheduleSlot.updateMany({
        where: { studentId },
        data: { teacherId: newTeacherId },
      })
    }

    // Aula nueva con el nuevo profe y migración de clases futuras.
    const classroom = await this.boards.ensureClassroom(newTeacherId, studentId)
    const meetingUrl = `/boards/${classroom.id}`
    const future = await this.prisma.class.findMany({
      where: { studentId, status: 'scheduled', startsAt: { gt: new Date() } },
    })
    let moved = 0
    for (const f of future) {
      // Cruce puntual (clase movida "solo esta semana" del nuevo profe).
      const clash = await this.prisma.class.findFirst({
        where: {
          teacherId: newTeacherId,
          id: { not: f.id },
          status: { in: ['scheduled', 'rescheduled'] },
          startsAt: { lt: f.endsAt },
          endsAt: { gt: f.startsAt },
        },
        select: { id: true },
      })
      if (clash) {
        await this.prisma.class.update({ where: { id: f.id }, data: { status: 'cancelled' } })
        continue
      }
      await this.prisma.class.update({
        where: { id: f.id },
        data: { teacherId: newTeacherId, meetingUrl },
      })
      moved++
    }

    await this.prisma.user.update({
      where: { id: studentId },
      data: { assignedTeacherId: newTeacherId, scheduleAssignmentStatus: 'auto_assigned' },
    })
    await this.notifyTeacherAssigned(studentId, newTeacherId, `admin-reassign:${Date.now()}`)
    await this.ensureUpcomingClasses(studentId)
    return { unassigned: false, movedSlots: slots.length, movedClasses: moved }
  }

  // ── Compra: materialización del horario tras pago aprobado ─────────
  /**
   * Idempotente (la llama finalizeTransaction). Orden de resolución:
   * 1) slots propios held/active que coinciden con la selección → reactivar.
   * 2) reserva pending del intent → reclamar (studentId + active).
   * 3) recomputar candidatos → crear slots con el mejor profe.
   * 4) sin candidatos → manual_pending + notificación a admins y estudiante.
   */
  async materializePurchase(userId: string, intent: { id: string; scheduleJson?: unknown }) {
    const slots = (intent.scheduleJson as SlotRef[] | null) ?? []
    if (!Array.isArray(slots) || slots.length === 0) return { mode: 'none' as const }

    const wanted = new Set(slots.map((s) => `${s.weekday}:${s.hour}`))
    const mine = await this.prisma.scheduleSlot.findMany({
      where: { studentId: userId, status: { in: ['active', 'held'] } },
    })
    const mineKeys = new Set(mine.map((m) => `${m.weekday}:${m.hour}`))
    const sameSet = mine.length === slots.length && [...wanted].every((k) => mineKeys.has(k))

    let teacherId: string | null = null

    if (sameSet && mine.length > 0) {
      // Renovación dentro del hold (o recompra igual): reactivar.
      await this.prisma.scheduleSlot.updateMany({
        where: { studentId: userId },
        data: { status: 'active', holdExpiresAt: null },
      })
      teacherId = mine[0].teacherId
      await this.slots.releasePendingForIntent(intent.id)
    } else {
      if (mine.length > 0) {
        await this.prisma.scheduleSlot.deleteMany({ where: { studentId: userId } })
      }
      // Reclamar la reserva del intent si sigue viva (puede ser parcial si el
      // estudiante ya ocupaba parte de las franjas con ese profe).
      const pend = await this.prisma.scheduleSlot.findMany({ where: { intentId: intent.id, status: 'pending' } })
      if (pend.length > 0) {
        const tid = pend[0].teacherId
        await this.prisma.scheduleSlot.updateMany({
          where: { intentId: intent.id, status: 'pending' },
          data: { studentId: userId, status: 'active', holdExpiresAt: null, intentId: null },
        })
        const claimed = new Set(pend.map((x) => `${x.weekday}:${x.hour}`))
        const missing = slots.filter((b) => !claimed.has(`${b.weekday}:${b.hour}`))
        try {
          if (missing.length > 0) {
            await this.prisma.$transaction(
              missing.map((b) =>
                this.prisma.scheduleSlot.create({
                  data: { teacherId: tid, studentId: userId, weekday: b.weekday, hour: b.hour, status: 'active' },
                }),
              ),
            )
          }
          teacherId = tid
        } catch {
          await this.prisma.scheduleSlot.deleteMany({ where: { studentId: userId } }).catch(() => null)
        }
      }
      if (!teacherId) {
        await this.slots.releasePendingForIntent(intent.id)
        // Pago tardío o carrera: recomputar candidatos.
        const candidates = await this.slots.candidateTeachers(slots)
        for (const tid of candidates) {
          try {
            await this.prisma.$transaction(
              slots.map((b) =>
                this.prisma.scheduleSlot.create({
                  data: { teacherId: tid, studentId: userId, weekday: b.weekday, hour: b.hour, status: 'active' },
                }),
              ),
            )
            teacherId = tid
            break
          } catch {
            await this.prisma.scheduleSlot.deleteMany({ where: { studentId: userId, status: 'active' } }).catch(() => null)
          }
        }
      }
    }

    if (teacherId) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          assignedTeacherId: teacherId,
          scheduleAssignmentStatus: 'auto_assigned',
          schedulePreferences: slots as any, // espejo de lectura
        },
      })
      await this.notifyTeacherAssigned(userId, teacherId, `purchase:${intent.id}`)
      await this.ensureUpcomingClasses(userId)
      return { mode: 'auto' as const, teacherId }
    }

    // Manual: guardar deseo, notificar a admins + estudiante (in-app).
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        scheduleAssignmentStatus: 'manual_pending',
        schedulePreferences: slots as any,
      },
    })
    const [student, admins] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, email: true } }),
      this.prisma.user.findMany({ where: { role: 'admin', deletedAt: null }, select: { id: true, email: true } }),
    ])
    for (const a of admins) {
      await this.notifications.enqueue({
        userId: a.id,
        toEmail: a.email,
        template: 'welcome',
        subject: 'Estudiante por coordinar',
        dedupeKey: `manual-schedule:${intent.id}:${a.id}`,
        inAppOnly: true,
        type: 'system',
        title: 'Estudiante pagó y espera profesor',
        body: `${student?.fullName ?? 'Estudiante'} pagó con un horario sin cobertura. Coordina su asignación.`,
        linkUrl: '/admin/users',
      })
    }
    if (student) {
      await this.notifications.enqueue({
        userId,
        toEmail: student.email,
        template: 'welcome',
        subject: 'Estamos coordinando tu profesor',
        dedupeKey: `manual-schedule-student:${intent.id}`,
        inAppOnly: true,
        type: 'system',
        title: 'Estamos coordinando tu profesor',
        body: 'Tu cupo está garantizado. Te contactamos en menos de 24 h hábiles.',
        linkUrl: '/app',
      })
    }
    return { mode: 'manual' as const }
  }
}
