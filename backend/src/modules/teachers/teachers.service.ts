import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'

@Injectable()
export class TeachersService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

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

  async studentDetail(teacherId: string, studentId: string, isAdmin = false) {
    if (!isAdmin) {
      const rel = await this.prisma.user.findFirst({
        where: {
          id: studentId,
          OR: [{ assignedTeacherId: teacherId }, { classesAsStudent: { some: { teacherId } } }],
        },
        select: { id: true },
      })
      if (!rel) throw new ForbiddenException('No autorizado sobre este estudiante')
    }
    return this.prisma.user.findUnique({
      where: { id: studentId },
      include: {
        classesAsStudent: {
          where: isAdmin ? {} : { teacherId },
          orderBy: { startsAt: 'desc' },
          take: 50,
          include: { notes: { orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }] } },
        },
      },
    })
  }

  async addNote(teacherId: string, classId: string, notes: string, isAdmin = false) {
    if (!notes || !notes.trim()) throw new BadRequestException('notes requerido')
    const c = await this.prisma.class.findUnique({ where: { id: classId }, select: { teacherId: true } })
    if (!c) throw new NotFoundException('Clase no encontrada')
    if (!isAdmin && c.teacherId !== teacherId) throw new ForbiddenException('La clase no es tuya')
    return this.prisma.classNote.create({ data: { teacherId, classId, notes: notes.trim() } })
  }

  async togglePin(teacherId: string, noteId: string, pinned: boolean, isAdmin = false) {
    const n = await this.prisma.classNote.findUnique({ where: { id: noteId }, select: { teacherId: true } })
    if (!n) throw new NotFoundException('Nota no encontrada')
    if (!isAdmin && n.teacherId !== teacherId) throw new ForbiddenException('La nota no es tuya')
    return this.prisma.classNote.update({ where: { id: noteId }, data: { pinned } })
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

  // ─── Ausencias (vacaciones / cita médica / enfermedad) ────────────────
  listAbsences(teacherId: string) {
    return this.prisma.teacherAbsence.findMany({ where: { teacherId }, orderBy: { startsAt: 'asc' } })
  }

  /**
   * Registra una ausencia y AVISA A LOS ADMINS (bandeja in-app) para que
   * gestionen reemplazos, listando las clases programadas afectadas.
   */
  async createAbsence(teacherId: string, startsAt: Date, endsAt: Date, reason?: string) {
    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      throw new BadRequestException('Rango de fechas inválido')
    }
    const absence = await this.prisma.teacherAbsence.create({
      data: { teacherId, startsAt, endsAt, reason },
    })
    const affected = await this.prisma.class.findMany({
      where: { teacherId, status: 'scheduled', startsAt: { gte: startsAt, lt: endsAt } },
      include: { student: { select: { id: true, fullName: true } } },
      orderBy: { startsAt: 'asc' },
    })
    const [teacher, admins] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: teacherId }, select: { fullName: true } }),
      this.prisma.user.findMany({ where: { role: 'admin', deletedAt: null }, select: { id: true, email: true } }),
    ])
    for (const a of admins) {
      await this.notifications.enqueue({
        userId: a.id,
        toEmail: a.email,
        template: 'welcome', // in-app only: no se renderiza email
        subject: 'Ausencia de profesor',
        dedupeKey: `absence:${absence.id}:${a.id}`,
        inAppOnly: true,
        type: 'teacher',
        title: 'Ausencia de profesor',
        body: `${teacher?.fullName ?? 'Un profesor'} bloqueó ${startsAt.toLocaleDateString('es-CO')}–${endsAt.toLocaleDateString('es-CO')}${reason ? ` (${reason})` : ''}. ${affected.length} clase(s) por reasignar.`,
        linkUrl: '/admin/schedule',
      })
    }
    return { absence, affected }
  }

  async deleteAbsence(teacherId: string, id: string) {
    const abs = await this.prisma.teacherAbsence.findUnique({ where: { id } })
    if (!abs || abs.teacherId !== teacherId) throw new ForbiddenException()
    await this.prisma.teacherAbsence.delete({ where: { id } })
    return { ok: true }
  }
}
