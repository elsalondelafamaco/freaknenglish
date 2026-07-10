import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'

/**
 * Bloques semanales de horario del estudiante.
 * weekday: 0=Dom..6=Sáb ; hour: 24h (7..21 típico).
 */
export interface ScheduleBlock {
  weekday: number
  hour: number
}

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
   * `auto_assigned`. Si no: `manual_pending`.
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
    if (match) await this.notifyTeacherAssigned(userId, match.id, 'onboarding')

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
   * bloques del profesor cubren TODAS sus preferencias, los auto-asigna.
   * Devuelve el listado de estudiantes reasignados.
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
      reassigned.push({ id: s.id, fullName: s.fullName })
    }
    return reassigned
  }
}