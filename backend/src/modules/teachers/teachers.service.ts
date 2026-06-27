import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class TeachersService {
  constructor(private prisma: PrismaService) {}

  async students(teacherId: string) {
    const classes = await this.prisma.class.findMany({
      where: { teacherId },
      select: { studentId: true },
      distinct: ['studentId'],
    })
    return this.prisma.user.findMany({
      where: { id: { in: classes.map((c) => c.studentId) } },
      include: { _count: { select: { classesAsStudent: true } } },
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
}
