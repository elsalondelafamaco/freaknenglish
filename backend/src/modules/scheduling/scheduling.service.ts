import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'

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
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

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
    const blocks = (user.schedulePreferences as any as ScheduleBlock[] | null) ?? []
    if (!Array.isArray(blocks) || blocks.length === 0) return { created: 0 }

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
        const endsAt = new Date(startsAt.getTime() + CLASS_DURATION_MIN * 60 * 1000)
        await this.prisma.class.create({
          data: {
            studentId,
            teacherId: user.assignedTeacherId,
            startsAt,
            endsAt,
            status: 'scheduled',
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
    if (blocks.length !== expected) {
      throw new BadRequestException(`Plan requires exactly ${expected} blocks`)
    }

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

    const status = match ? 'auto_assigned' : 'manual_pending'
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        schedulePreferences: blocks as any,
        scheduleAssignmentStatus: status,
        assignedTeacherId: match?.id ?? user.assignedTeacherId ?? null,
        onboardedAt: user.onboardedAt ?? new Date(),
      },
    })
    if (match) {
      await this.notifyTeacherAssigned(userId, match.id, 'onboarding')
      await this.ensureUpcomingClasses(userId)
    }

    return {
      status,
      teacher: match ? { id: match.id, fullName: match.fullName } : null,
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
    return u
  }

  // ── Admin ──────────────────────────────────────────────────────────

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
}
