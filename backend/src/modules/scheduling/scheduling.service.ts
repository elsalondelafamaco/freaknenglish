import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { IS_ACTIVE_TEACHER, IS_TEACHER, hasRole } from '../../common/roles'
import { NotificationsService } from '../notifications/notifications.service'
import { BoardService } from '../board/board.service'
import { SlotsService, SlotRef } from './slots.service'
import { SubscriptionsService } from '../subscriptions/subscriptions.service'

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
  private readonly log = new Logger(SchedulingService.name)

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private boards: BoardService,
    private slots: SlotsService,
    private subscriptions: SubscriptionsService,
  ) {}

  /** Horario semanal legible ("lunes 7:00, miércoles 7:00") para los correos. */
  private async scheduleSummary(studentId: string): Promise<string | undefined> {
    const slots = await this.prisma.scheduleSlot.findMany({
      where: { studentId, status: { in: ['active', 'held'] } },
      orderBy: [{ weekday: 'asc' }, { hour: 'asc' }],
      select: { weekday: true, hour: true },
    })
    if (slots.length === 0) return undefined
    return slots.map((s) => `${SchedulingService.DAY_NAMES[s.weekday]} ${s.hour}:00`).join(', ')
  }

  /** Notifica asignación a AMBOS: estudiante (wording cálido) y profesor. */
  private async notifyTeacherAssigned(studentId: string, teacherId: string, dedupeSuffix: string) {
    const [student, teacher, schedule] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: studentId } }),
      this.prisma.user.findUnique({ where: { id: teacherId } }),
      this.scheduleSummary(studentId),
    ])
    if (!student || !teacher) return
    // El mes del estudiante no corre mientras espera profesor. Aquí ya lo
    // tiene, así que se arranca el período si estaba pendiente. Va en este
    // punto porque TODAS las asignaciones (onboarding, manual, reasignación y
    // compra) pasan por aquí; es idempotente si el reloj ya estaba andando.
    await this.subscriptions.startPeriodOnTeacherAssigned(student.id)
    await this.notifications.enqueue({
      userId: student.id,
      toEmail: student.email,
      template: 'teacher_assigned',
      subject: `¡Ya tienes profe! Te presentamos a ${teacher.fullName}`,
      dedupeKey: `teacher-assigned:${student.id}:${teacher.id}:${dedupeSuffix}`,
      vars: { teacherName: teacher.fullName, schedule },
      type: 'teacher',
      title: 'Nuevo profesor asignado',
      body: teacher.fullName,
      linkUrl: '/app',
    })
    await this.notifications.enqueue({
      userId: teacher.id,
      toEmail: teacher.email,
      template: 'student_assigned',
      subject: `Nuevo estudiante: ${student.fullName}`,
      dedupeKey: `student-assigned:${student.id}:${teacher.id}:${dedupeSuffix}`,
      vars: { studentName: student.fullName, schedule },
      type: 'teacher',
      title: 'Nuevo estudiante asignado',
      body: student.fullName,
      linkUrl: '/teacher/students',
    })
  }

  /** Notifica al profesor que un estudiante salió de su agenda. */
  private async notifyStudentUnassigned(studentId: string, teacherId: string) {
    const [student, teacher] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: studentId }, select: { fullName: true } }),
      this.prisma.user.findUnique({ where: { id: teacherId }, select: { id: true, email: true } }),
    ])
    if (!student || !teacher) return
    await this.notifications.enqueue({
      userId: teacher.id,
      toEmail: teacher.email,
      template: 'student_unassigned',
      subject: `Baja de estudiante: ${student.fullName}`,
      dedupeKey: `student-unassigned:${studentId}:${teacherId}:${Date.now()}`,
      vars: { studentName: student.fullName },
      type: 'teacher',
      title: 'Estudiante dado de baja',
      body: student.fullName,
      linkUrl: '/teacher/schedule',
    })
  }

  /**
   * Convierte (weekday, hour local Bogotá, semanas de offset) en el instante
   * real (UTC) de la clase.
   */
  /** Medianoche de mañana en hora Bogotá, como instante UTC. */
  private startOfTomorrowBogota(): Date {
    const nowLocal = new Date(Date.now() - BOGOTA_OFFSET_MS)
    const wallMs = Date.UTC(
      nowLocal.getUTCFullYear(),
      nowLocal.getUTCMonth(),
      nowLocal.getUTCDate() + 1,
      0, 0, 0,
    )
    return new Date(wallMs + BOGOTA_OFFSET_MS)
  }

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

    // Las clases arrancan a partir de MAÑANA, nunca el mismo día en que el
    // estudiante compra o elige horario: nadie alcanza a prepararse (ni el
    // profe ni el estudiante) para una clase que empieza en un par de horas.
    const noNantesDe = this.startOfTomorrowBogota()
    // Duración por estudiante (ej. 75 min); null = estándar de 50.
    const durationMin = user.classDurationMin ?? CLASS_DURATION_MIN
    let created = 0
    for (const b of blocks) {
      if (typeof b?.weekday !== 'number' || typeof b?.hour !== 'number') continue
      for (let w = 0; w < GENERATION_WEEKS; w++) {
        const startsAt = this.buildClassInstant(b.weekday, b.hour, w)
        if (startsAt.getTime() < noNantesDe.getTime()) continue
        const endsAt = new Date(startsAt.getTime() + durationMin * 60 * 1000)
        const exists = await this.prisma.class.findFirst({
          where: { studentId, startsAt },
          select: { id: true },
        })
        if (exists) continue
        // Evita doble-reserva del profesor: cualquier clase suya que se cruce
        // con [startsAt, endsAt) — una clase larga puede invadir la hora siguiente.
        const teacherBusy = await this.prisma.class.findFirst({
          where: {
            teacherId: user.assignedTeacherId,
            status: { in: ['scheduled', 'rescheduled', 'validated'] },
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
          select: { id: true },
        })
        if (teacherBusy) {
          // Antes esto era silencioso: un estudiante pago podía quedarse sin
          // su clase semanal sin que nadie lo viera. Al menos queda rastro.
          this.log.warn(
            `Clase NO generada por cruce de agenda: estudiante ${studentId}, profe ${user.assignedTeacherId}, ${startsAt.toISOString()} (${durationMin} min)`,
          )
          continue
        }
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
    // Valida cantidad, ventana global, máximo por día (config admin) y —para
    // estudiantes con clase larga— separación y ajuste dentro de la ventana.
    const durationMin = user.classDurationMin ?? 50
    await this.slots.validateSelection(blocks, expected, durationMin)

    // Buscar profesor que cubra todos los bloques.
    const teachers = await this.prisma.user.findMany({
      where: IS_ACTIVE_TEACHER,
      include: { availability: true },
    })
    const match = teachers.find((t) =>
      blocks.every((b) =>
        t.availability.some((a) => a.weekday === b.weekday && isHourInRange(b.hour, a.startsAt, a.endsAt)),
      ),
    )

    let effectiveMatch = match ?? null
    if (effectiveMatch) {
      // El match por hora de inicio no basta para clases largas ni ve las
      // horas invadidas por otros estudiantes largos: la misma validación
      // del alta admin decide; si no cabe, degrada a asignación manual.
      try {
        await this.assertBlocksFitTeacher(effectiveMatch.id, blocks, durationMin, userId)
      } catch {
        effectiveMatch = null
      }
    }
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
      where: { ...IS_TEACHER, deletedAt: null },
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

  /**
   * Verifica que el profesor pueda recibir estos bloques con la duración
   * dada. Una clase larga (p. ej. 75 min) ocupa también la(s) celda(s)
   * siguiente(s), así que: (1) el choque con franjas de otros estudiantes se
   * revisa sobre TODAS las horas que abarca la clase, y (2) con más de 60 min
   * la disponibilidad declarada del profe debe cubrir el intervalo completo —
   * es decir, tener las horas seguidas pintadas (8:00 Y 9:00 para un 8:00–9:15).
   */
  private async assertBlocksFitTeacher(
    teacherId: string,
    blocks: ScheduleBlock[],
    durationMin: number,
    excludeStudentId: string,
  ) {
    const span = Math.max(1, Math.ceil(durationMin / 60))
    const cells: ScheduleBlock[] = blocks.flatMap((b) =>
      Array.from({ length: span }, (_, i) => ({ weekday: b.weekday, hour: b.hour + i })),
    )
    // Franjas ocupadas del profe expandidas según la duración de CADA dueño:
    // un estudiante largo ya asignado invade la hora siguiente aunque su slot
    // solo viva en la hora de inicio.
    const existing = await this.prisma.scheduleSlot.findMany({
      where: {
        teacherId,
        status: { in: ['pending', 'active', 'held'] },
        NOT: { studentId: excludeStudentId },
      },
      select: { weekday: true, hour: true, student: { select: { classDurationMin: true } } },
    })
    const occupied = new Set<string>()
    for (const s of existing) {
      const ownerSpan = Math.max(1, Math.ceil((s.student?.classDurationMin ?? 50) / 60))
      for (let i = 0; i < ownerSpan; i++) occupied.add(`${s.weekday}:${s.hour + i}`)
    }
    const conflicts = cells.filter((c) => occupied.has(`${c.weekday}:${c.hour}`))
    if (conflicts.length > 0) {
      throw new BadRequestException(
        `El profesor ya tiene ocupadas: ${conflicts
          .map((c) => `${SchedulingService.DAY_NAMES[c.weekday]} ${c.hour}:00`)
          .join(', ')} (las clases largas ocupan también la hora siguiente)`,
      )
    }
    if (durationMin > 60) {
      const toMin = (s: string) => {
        const [h, m] = s.split(':').map(Number)
        return (h ?? 0) * 60 + (m ?? 0)
      }
      const avail = await this.prisma.teacherAvailability.findMany({ where: { teacherId } })
      for (const b of blocks) {
        const needStart = b.hour * 60
        const needEnd = needStart + durationMin
        const covered = avail.some(
          (r) => r.weekday === b.weekday && toMin(r.startsAt) <= needStart && toMin(r.endsAt) >= needEnd,
        )
        if (!covered) {
          throw new BadRequestException(
            `El profesor no tiene disponibilidad continua para una clase de ${durationMin} min el ${SchedulingService.DAY_NAMES[b.weekday]} a las ${b.hour}:00: necesita tener pintadas las horas seguidas (${b.hour}:00 y ${b.hour + span - 1}:00) en su disponibilidad.`,
          )
        }
      }
    }
  }

  async assignRequest(studentId: string, teacherId: string) {
    const t = await this.prisma.user.findUnique({ where: { id: teacherId } })
    if (!t || !hasRole(t, 'teacher')) throw new BadRequestException('Invalid teacher')
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { schedulePreferences: true, classDurationMin: true },
    })
    const blocks = (student?.schedulePreferences as any as ScheduleBlock[] | null) ?? []
    if (blocks.length > 0) {
      await this.assertBlocksFitTeacher(teacherId, blocks, student?.classDurationMin ?? 50, studentId)
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

  /**
   * Disponibilidad declarada de TODOS los profesores activos, para pintarla de
   * fondo en el calendario global del admin. Se devuelve en una sola llamada
   * porque el calendario la necesita completa: pedir una por profesor serían
   * N requests cada vez que se cambia de semana.
   */
  async allTeachersAvailability() {
    const profes = await this.prisma.user.findMany({
      where: IS_ACTIVE_TEACHER,
      select: { id: true },
    })
    return this.prisma.teacherAvailability.findMany({
      where: { teacherId: { in: profes.map((p) => p.id) } },
      orderBy: [{ weekday: 'asc' }, { startsAt: 'asc' }],
    })
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
    if (!teacher || !hasRole(teacher, 'teacher') || teacher.disabledAt || teacher.deletedAt) return []

    const pending = await this.prisma.user.findMany({
      where: { scheduleAssignmentStatus: 'manual_pending', deletedAt: null },
      select: { id: true, fullName: true, schedulePreferences: true, classDurationMin: true },
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
      // Estudiantes con clase larga: mismas reglas que el alta admin
      // (celdas invadidas + disponibilidad continua del profe).
      try {
        await this.assertBlocksFitTeacher(teacherId, blocks, s.classDurationMin ?? 50, s.id)
      } catch {
        continue // no cabe con este profe: sigue pendiente
      }
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
    const prev = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { assignedTeacherId: true },
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
      // Aviso de baja al profe que lo tenía.
      if (prev?.assignedTeacherId) {
        await this.notifyStudentUnassigned(studentId, prev.assignedTeacherId)
      }
      return { unassigned: true, movedSlots: 0, movedClasses: 0 }
    }

    // Horarios cruzados: franjas del estudiante ya ocupadas por el nuevo
    // profe, incluyendo las horas que invade una clase larga, y (para >60 min)
    // que el nuevo profe tenga la disponibilidad continua pintada.
    if (slots.length > 0) {
      const durStudent = await this.prisma.user.findUnique({
        where: { id: studentId },
        select: { classDurationMin: true },
      })
      await this.assertBlocksFitTeacher(
        newTeacherId,
        slots.map((s) => ({ weekday: s.weekday, hour: s.hour })),
        durStudent?.classDurationMin ?? 50,
        studentId,
      )
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
    // Baja para el profe anterior (si había y es distinto al nuevo).
    if (prev?.assignedTeacherId && prev.assignedTeacherId !== newTeacherId) {
      await this.notifyStudentUnassigned(studentId, prev.assignedTeacherId)
    }
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
