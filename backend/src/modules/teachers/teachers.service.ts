import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class TeachersService {
  constructor(private prisma: PrismaService) {}

  async students(teacherId: string) {
    // Incluye estudiantes explícitamente asignados (aún sin clases) Y
    // estudiantes con historial de clases con este profesor.
    const classes = await this.prisma.class.findMany({
      where: { teacherId },
      select: { studentId: true },
      distinct: ['studentId'],
    })
    const classStudentIds = classes.map((c) => c.studentId)
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        role: 'student',
        OR: [
          { assignedTeacherId: teacherId },
          ...(classStudentIds.length ? [{ id: { in: classStudentIds } }] : []),
        ],
      },
      include: { _count: { select: { classesAsStudent: true } } },
      orderBy: { fullName: 'asc' },
    })
  }

  studentDetail(teacherId: string, studentId: string) {
    return this.prisma.user.findUnique({
      where: { id: studentId },
      include: {
        classesAsStudent: {
          where: { teacherId },
          orderBy: { startsAt: 'desc' },
          take: 50,
          include: { notes: true },
        },
      },
    })
  }

  addNote(teacherId: string, classId: string, rating: number, notes: string) {
    return this.prisma.classNote.create({ data: { teacherId, classId, rating, notes } })
  }

  schedule(teacherId: string, status?: 'upcoming' | 'past' | 'pending') {
    const now = new Date()
    const where: any = { teacherId }
    if (status === 'upcoming') Object.assign(where, { startsAt: { gte: now }, status: 'scheduled' })
    else if (status === 'past') Object.assign(where, { startsAt: { lt: now } })
    else if (status === 'pending') Object.assign(where, { status: 'scheduled', startsAt: { lt: now } })
    return this.prisma.class.findMany({
      where,
      orderBy: { startsAt: status === 'past' ? 'desc' : 'asc' },
      include: { student: { select: { id: true, fullName: true, englishLevel: true } } },
      take: 200,
    })
  }
}
