import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ClassStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000

@Injectable()
export class ClassesService {
  constructor(private prisma: PrismaService) {}

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
    return this.prisma.class.update({
      where: { id: classId },
      data: { startsAt: newStartsAt, endsAt: newEndsAt, status: ClassStatus.rescheduled },
    })
  }

  async cancel(classId: string, studentId: string, reason?: string) {
    const c = await this.prisma.class.findUnique({ where: { id: classId } })
    if (!c || c.studentId !== studentId) throw new ForbiddenException()
    if (c.startsAt.getTime() - Date.now() < TWELVE_HOURS_MS) {
      throw new BadRequestException('Cannot cancel within 12h of class')
    }
    return this.prisma.class.update({
      where: { id: classId },
      data: { status: ClassStatus.cancelled, cancelledAt: new Date(), cancelReason: reason },
    })
  }
}
