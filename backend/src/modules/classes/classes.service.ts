import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ClassStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000

@Injectable()
export class ClassesService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  listForStudent(studentId: string) {
    return this.prisma.class.findMany({
      where: { studentId },
      orderBy: { startsAt: 'asc' },
      include: { teacher: { select: { id: true, fullName: true, avatarUrl: true } } },
    })
  }

  listForTeacher(teacherId: string) {
    return this.prisma.class.findMany({
      where: { teacherId },
      orderBy: { startsAt: 'asc' },
      include: { student: { select: { id: true, fullName: true, englishLevel: true } } },
    })
  }

  upcoming(studentId: string) {
    return this.prisma.class.findFirst({
      where: { studentId, status: 'scheduled', startsAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
      orderBy: { startsAt: 'asc' },
      include: { teacher: { select: { id: true, fullName: true, avatarUrl: true } } },
    })
  }

  todayForTeacher(teacherId: string) {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end = new Date(start); end.setDate(end.getDate() + 1)
    return this.prisma.class.findMany({
      where: { teacherId, startsAt: { gte: start, lt: end } },
      orderBy: { startsAt: 'asc' },
      include: { student: { select: { id: true, fullName: true, englishLevel: true } } },
    })
  }

  async validateAttendance(classId: string, teacherId: string) {
    const c = await this.prisma.class.findUnique({ where: { id: classId } })
    if (!c) throw new NotFoundException('Class not found')
    if (c.teacherId && c.teacherId !== teacherId) throw new ForbiddenException()
    return this.prisma.class.update({
      where: { id: classId },
      data: { status: ClassStatus.validated, validatedAt: new Date() },
    })
  }

  async studentConfirm(classId: string, studentId: string) {
    const c = await this.prisma.class.findUnique({ where: { id: classId } })
    if (!c || c.studentId !== studentId) throw new ForbiddenException()
    return this.prisma.class.update({
      where: { id: classId },
      data: { status: ClassStatus.validated, validatedAt: new Date() },
    })
  }

  async reschedule(classId: string, studentId: string, newStartsAt: Date, newEndsAt: Date) {
    const c = await this.prisma.class.findUnique({ where: { id: classId } })
    if (!c || c.studentId !== studentId) throw new ForbiddenException()
    if (c.startsAt.getTime() - Date.now() < TWELVE_HOURS_MS) {
      throw new BadRequestException('Cannot reschedule within 12h of class')
    }
    const updated = await this.prisma.class.update({
      where: { id: classId },
      data: { startsAt: newStartsAt, endsAt: newEndsAt, status: ClassStatus.rescheduled },
    })
    const student = await this.prisma.user.findUnique({ where: { id: studentId } })
    if (student) {
      await this.notifications.enqueue({
        userId: student.id,
        toEmail: student.email,
        template: 'class_rescheduled',
        subject: 'Tu clase fue reprogramada',
        dedupeKey: `reschedule:${classId}:${newStartsAt.toISOString()}`,
        vars: { startsAt: newStartsAt.toISOString() },
        type: 'class',
        title: 'Clase reprogramada',
        body: newStartsAt.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }),
        linkUrl: '/app/calendar',
      })
    }
    if (c.teacherId) {
      const teacher = await this.prisma.user.findUnique({ where: { id: c.teacherId } })
      if (teacher) {
        await this.notifications.enqueue({
          userId: teacher.id,
          toEmail: teacher.email,
          template: 'class_rescheduled',
          subject: 'Una clase fue reprogramada',
          dedupeKey: `reschedule-teacher:${classId}:${newStartsAt.toISOString()}`,
          vars: { startsAt: newStartsAt.toISOString() },
          type: 'class',
          title: 'Clase reprogramada',
          body: `${student?.fullName ?? 'Un estudiante'} reprogramó su clase.`,
          linkUrl: '/teacher/schedule',
        })
      }
    }
    return updated
  }

  async cancel(classId: string, studentId: string, reason?: string) {
    const c = await this.prisma.class.findUnique({ where: { id: classId } })
    if (!c || c.studentId !== studentId) throw new ForbiddenException()
    if (c.startsAt.getTime() - Date.now() < TWELVE_HOURS_MS) {
      throw new BadRequestException('Cannot cancel within 12h of class')
    }
    const updated = await this.prisma.class.update({
      where: { id: classId },
      data: { status: ClassStatus.cancelled, cancelledAt: new Date(), cancelReason: reason },
    })
    if (c.teacherId) {
      const teacher = await this.prisma.user.findUnique({ where: { id: c.teacherId } })
      const student = await this.prisma.user.findUnique({ where: { id: studentId } })
      if (teacher) {
        await this.notifications.enqueue({
          userId: teacher.id,
          toEmail: teacher.email,
          template: 'class_cancelled',
          subject: 'Una clase fue cancelada',
          dedupeKey: `cancel-teacher:${classId}`,
          vars: { reason: reason ?? '' },
          type: 'class',
          title: 'Clase cancelada',
          body: `${student?.fullName ?? 'Un estudiante'} canceló su clase.`,
          linkUrl: '/teacher/schedule',
        })
      }
    }
    return updated
  }
}
