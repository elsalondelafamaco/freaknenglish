import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ClassStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { env } from '../../config/env'

@Injectable()
export class ClassesService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  /**
   * Ventana (ms) para que el estudiante cancele/reagende de forma autónoma.
   * Configurable en `app_settings` (key `reschedule_lock_hours`); si no existe,
   * usa RESCHEDULE_LOCK_HOURS (default 24h).
   */
  private async rescheduleLockMs(): Promise<number> {
    const row = await this.prisma.appSetting
      .findUnique({ where: { key: 'reschedule_lock_hours' } })
      .catch(() => null)
    const raw = row?.value as any
    const hours = typeof raw === 'number' ? raw : Number(raw?.value ?? raw ?? NaN)
    const effective = Number.isFinite(hours) && hours > 0 ? hours : env.RESCHEDULE_LOCK_HOURS
    return effective * 60 * 60 * 1000
  }

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
      include: { student: { select: { id: true, fullName: true, englishLevel: true, meetingUrl: true } } },
    })
  }

  /**
   * Validación CRUZADA de asistencia (anti-fraude).
   * - El profesor marca `teacherValidatedAt`.
   * - El estudiante marca `studentConfirmedAt` (botón "Sí, tomé mi clase").
   * Solo cuando AMBOS coinciden la clase pasa a `validated` (y `validatedAt`
   * se setea), que es lo único que cuenta para nómina. Si falta una parte, la
   * clase queda `scheduled` con el timestamp parcial correspondiente.
   */
  async validateAttendance(classId: string, teacherId: string) {
    const c = await this.prisma.class.findUnique({ where: { id: classId } })
    if (!c) throw new NotFoundException('Class not found')
    if (c.teacherId && c.teacherId !== teacherId) throw new ForbiddenException()
    const bothConfirmed = !!c.studentConfirmedAt
    return this.prisma.class.update({
      where: { id: classId },
      data: {
        teacherValidatedAt: new Date(),
        ...(bothConfirmed ? { status: ClassStatus.validated, validatedAt: new Date() } : {}),
      },
    })
  }

  async studentConfirm(classId: string, studentId: string) {
    const c = await this.prisma.class.findUnique({ where: { id: classId } })
    if (!c || c.studentId !== studentId) throw new ForbiddenException()
    const bothConfirmed = !!c.teacherValidatedAt
    return this.prisma.class.update({
      where: { id: classId },
      data: {
        studentConfirmedAt: new Date(),
        ...(bothConfirmed ? { status: ClassStatus.validated, validatedAt: new Date() } : {}),
      },
    })
  }

  /**
   * No-show: registro de AUSENCIA del estudiante para métricas. La clase
   * sigue pagándose al profesor (la nómina cuenta validated + no_show) —
   * el profe estuvo presente. Además invita al estudiante a su próxima clase.
   */
  async markNoShow(classId: string, teacherId: string) {
    const c = await this.prisma.class.findUnique({ where: { id: classId } })
    if (!c) throw new NotFoundException('Class not found')
    if (c.teacherId && c.teacherId !== teacherId) throw new ForbiddenException()
    const now = Date.now()
    // Ventana (decisión Q2): desde el inicio de la clase hasta 48 h después del fin.
    if (now < c.startsAt.getTime()) throw new BadRequestException('La clase aún no inicia')
    if (now > c.endsAt.getTime() + 48 * 60 * 60 * 1000) {
      throw new BadRequestException('La ventana de 48 h para marcar no tomada ya venció')
    }
    if (!['scheduled', 'validated'].includes(c.status)) {
      throw new BadRequestException('Esta clase no se puede marcar como no tomada')
    }
    const updated = await this.prisma.class.update({
      where: { id: classId },
      data: { status: ClassStatus.no_show, validatedAt: null, autoValidated: false },
    })
    // Invitación cálida a la próxima clase.
    const student = await this.prisma.user.findUnique({ where: { id: c.studentId } })
    if (student) {
      const next = await this.prisma.class.findFirst({
        where: { studentId: c.studentId, status: 'scheduled', startsAt: { gt: new Date() } },
        orderBy: { startsAt: 'asc' },
        select: { startsAt: true },
      })
      await this.notifications.enqueue({
        userId: student.id,
        toEmail: student.email,
        template: 'class_no_show',
        subject: 'Te extrañamos en tu clase 💛',
        dedupeKey: `no-show:${classId}`,
        vars: {
          fullName: student.fullName?.split(' ')[0],
          nextClass: next
            ? next.startsAt.toLocaleString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' })
            : undefined,
        },
        type: 'class',
        title: 'No pudiste asistir a tu clase',
        body: 'Te esperamos en la próxima — tu progreso se construye con constancia.',
        linkUrl: '/app/calendar',
      })
    }
    return updated
  }

  /**
   * Reprogramación ONE-OFF: mueve SOLO esta instancia de clase (puede ser a
   * otra semana) sin tocar el horario recurrente — la siguiente semana se
   * genera normal en su franja de siempre. Profesor (dueño) o admin.
   */
  async reschedule(classId: string, actor: { id: string; role: string }, newStartsAt: Date, newEndsAt: Date) {
    const c = await this.prisma.class.findUnique({ where: { id: classId } })
    if (!c) throw new NotFoundException('Class not found')
    const isOwnerTeacher = c.teacherId === actor.id
    const isAdmin = actor.role === 'admin'
    if (!isOwnerTeacher && !isAdmin) throw new ForbiddenException('Solo el profesor de la clase o un admin')
    if (!['scheduled', 'rescheduled'].includes(c.status)) {
      throw new BadRequestException('Solo se pueden mover clases programadas')
    }
    if (newEndsAt.getTime() <= newStartsAt.getTime()) throw new BadRequestException('Rango inválido')
    // Cruce con otra clase del profesor en el destino.
    if (c.teacherId) {
      const clash = await this.prisma.class.findFirst({
        where: {
          teacherId: c.teacherId,
          id: { not: c.id },
          status: { in: ['scheduled', 'rescheduled'] },
          startsAt: { lt: newEndsAt },
          endsAt: { gt: newStartsAt },
        },
        select: { id: true },
      })
      if (clash) throw new BadRequestException('El profesor ya tiene una clase en ese horario')
    }
    const updated = await this.prisma.class.update({
      where: { id: classId },
      data: { startsAt: newStartsAt, endsAt: newEndsAt, status: ClassStatus.rescheduled },
    })
    const student = await this.prisma.user.findUnique({ where: { id: c.studentId } })
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

  /** Cancela una instancia de clase. Profesor (dueño) o admin. */
  async cancel(classId: string, actor: { id: string; role: string }, reason?: string) {
    const c = await this.prisma.class.findUnique({ where: { id: classId } })
    if (!c) throw new NotFoundException('Class not found')
    const isOwnerTeacher = c.teacherId === actor.id
    if (!isOwnerTeacher && actor.role !== 'admin') throw new ForbiddenException('Solo el profesor de la clase o un admin')
    if (!['scheduled', 'rescheduled'].includes(c.status)) {
      throw new BadRequestException('Solo se pueden cancelar clases programadas')
    }
    const updated = await this.prisma.class.update({
      where: { id: classId },
      data: { status: ClassStatus.cancelled, cancelledAt: new Date(), cancelReason: reason },
    })
    // Avisa al estudiante (quien cancela es el profe/admin).
    const student = await this.prisma.user.findUnique({ where: { id: c.studentId } })
    if (student) {
      await this.notifications.enqueue({
        userId: student.id,
        toEmail: student.email,
        template: 'class_cancelled',
        subject: 'Tu clase fue cancelada',
        dedupeKey: `cancel-student:${classId}`,
        vars: { reason: reason ?? '' },
        type: 'class',
        title: 'Clase cancelada',
        body: reason || 'Coordina con tu profesor la reposición.',
        linkUrl: '/app/calendar',
      })
    }
    return updated
  }

  /**
   * Reporte del estudiante sobre una clase dictada (problema con la clase,
   * el profe no llegó, etc.). Notifica a TODOS los admins por correo + in-app.
   */
  async reportClass(classId: string, studentId: string, note: string) {
    if (!note.trim()) throw new BadRequestException('Cuéntanos qué pasó con la clase')
    const c = await this.prisma.class.findUnique({
      where: { id: classId },
      include: {
        student: { select: { id: true, fullName: true, email: true } },
        teacher: { select: { id: true, fullName: true } },
      },
    })
    if (!c || c.studentId !== studentId) throw new ForbiddenException()
    const when = c.startsAt.toLocaleString('es-CO', {
      dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Bogota',
    })
    const admins = await this.prisma.user.findMany({
      where: { role: 'admin', deletedAt: null, disabledAt: null },
      select: { id: true, email: true },
    })
    for (const a of admins) {
      await this.notifications.enqueue({
        userId: a.id,
        toEmail: a.email,
        template: 'class_reported',
        subject: `⚠️ Reporte de clase: ${c.student.fullName}`,
        dedupeKey: `class-report:${classId}:${a.id}:${Date.now()}`,
        vars: {
          studentName: c.student.fullName,
          teacherName: c.teacher?.fullName ?? 'Sin profesor',
          when,
          note: note.trim(),
        },
        type: 'class',
        title: `Reporte de clase de ${c.student.fullName}`,
        body: note.trim().slice(0, 140),
        linkUrl: `/admin/users/${c.student.id}`,
      })
    }
    return { ok: true }
  }

  /**
   * Ajuste MANUAL del admin: fuerza el estado de una clase (tomada / no
   * tomada / programada / cancelada) para correcciones de nómina y métricas.
   */
  async adminSetStatus(classId: string, status: 'validated' | 'no_show' | 'scheduled' | 'cancelled') {
    const c = await this.prisma.class.findUnique({ where: { id: classId } })
    if (!c) throw new NotFoundException('Class not found')
    return this.prisma.class.update({
      where: { id: classId },
      data: {
        status: status as ClassStatus,
        validatedAt: status === 'validated' ? (c.validatedAt ?? new Date()) : null,
        autoValidated: false,
        ...(status === 'cancelled' ? { cancelledAt: new Date() } : {}),
      },
    })
  }
}
