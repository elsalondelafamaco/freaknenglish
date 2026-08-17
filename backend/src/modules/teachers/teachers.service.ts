import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { SlotsService, availabilityCovers } from '../scheduling/slots.service'
import { assertDentroDeLaVentana } from '../scheduling/class-window'
import { LearningService } from '../learning/learning.service'

@Injectable()
export class TeachersService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private slots: SlotsService,
    private learning: LearningService,
  ) {}

  /** El profe solo opera sobre sus estudiantes; el admin sobre todos. */
  private async assertOwnsStudent(teacherId: string, studentId: string, isAdmin = false) {
    if (isAdmin) return
    const rel = await this.prisma.user.findFirst({
      where: {
        id: studentId,
        OR: [{ assignedTeacherId: teacherId }, { classesAsStudent: { some: { teacherId } } }],
      },
      select: { id: true },
    })
    if (!rel) throw new ForbiddenException('No autorizado sobre este estudiante')
  }

  /**
   * Franjas semanales ocupadas por estudiantes, con las horas que realmente
   * abarca cada clase: una de 75 min que empieza a las 8:00 devuelve [8, 9].
   * El editor de disponibilidad las usa para avisar antes de despintar una
   * hora con clase —quitarla no desasigna a nadie, así que el desajuste pasa
   * inadvertido hasta que alguien cruza el calendario con la grilla a mano.
   */
  async myOccupiedSlots(teacherId: string) {
    const slots = await this.prisma.scheduleSlot.findMany({
      where: {
        teacherId,
        status: { in: ['pending', 'active', 'held'] },
        studentId: { not: null },
      },
      select: {
        weekday: true,
        hour: true,
        student: { select: { id: true, fullName: true, classDurationMin: true } },
      },
      orderBy: [{ weekday: 'asc' }, { hour: 'asc' }],
    })
    return slots.map((s) => {
      const durationMin = s.student?.classDurationMin ?? 50
      const span = Math.max(1, Math.ceil(durationMin / 60))
      return {
        weekday: s.weekday,
        hour: s.hour,
        durationMin,
        studentId: s.student?.id ?? null,
        studentName: s.student?.fullName ?? null,
        hours: Array.from({ length: span }, (_, i) => s.hour + i),
      }
    })
  }

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
    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
      include: {
        classesAsStudent: {
          where: isAdmin ? {} : { teacherId },
          orderBy: { startsAt: 'desc' },
          take: 50,
        },
      },
    })
    if (!user) return null
    const teacherNotes = await this.notesForStudent(teacherId, studentId, isAdmin)
    return { ...user, teacherNotes }
  }

  async addNote(teacherId: string, classId: string, notes: string, isAdmin = false) {
    if (!notes || !notes.trim()) throw new BadRequestException('notes requerido')
    const c = await this.prisma.class.findUnique({ where: { id: classId }, select: { teacherId: true } })
    if (!c) throw new NotFoundException('Clase no encontrada')
    if (!isAdmin && c.teacherId !== teacherId) throw new ForbiddenException('La clase no es tuya')
    return this.prisma.classNote.create({ data: { teacherId, classId, notes: notes.trim() } })
  }

  /** Nota privada a nivel ESTUDIANTE (no requiere clases existentes). */
  async addStudentNote(teacherId: string, studentId: string, notes: string, isAdmin = false) {
    if (!notes || !notes.trim()) throw new BadRequestException('notes requerido')
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
    return this.prisma.classNote.create({ data: { teacherId, studentId, notes: notes.trim() } })
  }

  /** Todas las notas del profe sobre el estudiante (nivel clase + estudiante). */
  async notesForStudent(teacherId: string, studentId: string, isAdmin = false) {
    return this.prisma.classNote.findMany({
      where: {
        OR: [{ studentId }, { class: { studentId } }],
        ...(isAdmin ? {} : { teacherId }),
      },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    })
  }

  async togglePin(teacherId: string, noteId: string, pinned: boolean, isAdmin = false) {
    const n = await this.prisma.classNote.findUnique({ where: { id: noteId }, select: { teacherId: true } })
    if (!n) throw new NotFoundException('Nota no encontrada')
    if (!isAdmin && n.teacherId !== teacherId) throw new ForbiddenException('La nota no es tuya')
    return this.prisma.classNote.update({ where: { id: noteId }, data: { pinned } })
  }

  schedule(teacherId: string, status?: 'upcoming' | 'past' | 'pending' | 'frozen') {
    const now = new Date()
    const where: any = { teacherId }
    // `upcoming` incluye las congeladas: si no, una clase que el profe congeló
    // desaparecía de su agenda antes incluso de su hora original y se le
    // olvidaba ponerle fecha.
    if (status === 'upcoming') {
      Object.assign(where, { startsAt: { gte: now }, status: { in: ['scheduled', 'pending_reschedule'] } })
    } else if (status === 'past') Object.assign(where, { startsAt: { lt: now } })
    else if (status === 'pending') Object.assign(where, { status: 'scheduled', startsAt: { lt: now } })
    // Todas las congeladas, sin importar su hora original: son las que están
    // esperando fecha nueva.
    else if (status === 'frozen') Object.assign(where, { status: 'pending_reschedule' })
    return this.prisma.class.findMany({
      where,
      orderBy: { startsAt: status === 'past' ? 'desc' : 'asc' },
      include: { student: { select: { id: true, fullName: true, englishLevel: true, meetingUrl: true } } },
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

  /**
   * Ausencia por CLASES (tachar clases concretas): cada clase seleccionada se
   * cancela, el estudiante es notificado y se registra una ausencia con el
   * horario exacto de esa clase. Las cancelaciones no auto-validan ni pagan.
   */
  async createAbsencesForClasses(teacherId: string, classIds: string[], reason?: string) {
    if (!Array.isArray(classIds) || classIds.length === 0) {
      throw new BadRequestException('Selecciona al menos una clase')
    }
    const classes = await this.prisma.class.findMany({
      where: { id: { in: classIds }, teacherId, status: 'scheduled', startsAt: { gt: new Date() } },
      include: { student: { select: { id: true, fullName: true, email: true } } },
      orderBy: { startsAt: 'asc' },
    })
    if (classes.length === 0) throw new BadRequestException('No hay clases futuras válidas en la selección')

    const fmt = (d: Date) =>
      new Date(d.getTime() - TeachersService.BOG_MS).toISOString().slice(0, 16).replace('T', ' ')
    const absences = [] as any[]
    for (const c of classes) {
      const abs = await this.prisma.teacherAbsence.create({
        data: { teacherId, startsAt: c.startsAt, endsAt: c.endsAt, reason },
      })
      absences.push(abs)
      await this.prisma.class.update({ where: { id: c.id }, data: { status: 'cancelled' } })
      await this.notifications.enqueue({
        userId: c.student.id,
        toEmail: c.student.email,
        template: 'class_cancelled',
        subject: 'Tu clase fue cancelada',
        dedupeKey: `absence-cancel:${c.id}`,
        vars: { reason: `Tu profesor no estará disponible el ${fmt(c.startsAt)}. Coordinaremos la reposición.` },
        type: 'class',
        title: 'Clase cancelada',
        body: `Tu clase del ${fmt(c.startsAt)} fue cancelada por ausencia del profesor.`,
        linkUrl: '/app/calendar',
      })
    }
    const [teacher, admins] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: teacherId }, select: { fullName: true } }),
      this.prisma.user.findMany({ where: { role: 'admin', deletedAt: null }, select: { id: true, email: true } }),
    ])
    for (const a of admins) {
      await this.notifications.enqueue({
        userId: a.id,
        toEmail: a.email,
        template: 'welcome',
        subject: 'Ausencia de profesor',
        dedupeKey: `absence-classes:${classes[0].id}:${a.id}`,
        inAppOnly: true,
        type: 'teacher',
        title: 'Ausencia de profesor',
        body: `${teacher?.fullName ?? 'Un profesor'} canceló ${classes.length} clase(s)${reason ? ` (${reason})` : ''}. Revisa reemplazos/reposiciones.`,
        linkUrl: '/admin/calendar',
      })
    }
    return { absences, cancelled: classes.length }
  }

  async deleteAbsence(teacherId: string, id: string) {
    const abs = await this.prisma.teacherAbsence.findUnique({ where: { id } })
    if (!abs || abs.teacherId !== teacherId) throw new ForbiddenException()
    await this.prisma.teacherAbsence.delete({ where: { id } })
    // Si la ausencia cubría una clase futura cancelada, se restaura.
    if (abs.startsAt.getTime() > Date.now()) {
      await this.prisma.class.updateMany({
        where: { teacherId, status: 'cancelled', startsAt: abs.startsAt },
        data: { status: 'scheduled' },
      })
    }
    return { ok: true }
  }

  /**
   * Resultados de actividades de aprendizaje del estudiante (bridge
   * FreaknActivity). Profesor: solo sus estudiantes; admin: cualquiera.
   */
  async studentActivityResults(teacherId: string, studentId: string, isAdmin = false) {
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
    return this.prisma.activityResult.findMany({
      where: { userId: studentId },
      orderBy: { updatedAt: 'desc' },
      include: {
        lesson: { select: { id: true, title: true, module: { select: { id: true, title: true, level: true } } } },
      },
    })
  }

  /** Estado de las compuertas de checkpoint de un estudiante. */
  async checkpointGates(teacherId: string, studentId: string, isAdmin = false) {
    await this.assertOwnsStudent(teacherId, studentId, isAdmin)
    return this.learning.checkpointsForStudent(studentId)
  }

  /** Habilita o revoca un checkpoint para el estudiante. */
  async setCheckpointGate(
    teacherId: string,
    studentId: string,
    lessonId: string,
    unlock: boolean,
    note: string | undefined,
    isAdmin = false,
  ) {
    await this.assertOwnsStudent(teacherId, studentId, isAdmin)
    return this.learning.setCheckpointUnlock(studentId, lessonId, teacherId, unlock, note)
  }

  /** Plan de contenido del estudiante: qué tiene habilitado y qué completó. */
  async lessonPlan(teacherId: string, studentId: string, isAdmin = false) {
    await this.assertOwnsStudent(teacherId, studentId, isAdmin)
    return this.learning.lessonPlanForStudent(studentId)
  }

  /** Habilita o revoca lecciones en lote para el estudiante. */
  async setLessonUnlocks(
    teacherId: string,
    studentId: string,
    lessonIds: string[],
    unlock: boolean,
    isAdmin = false,
  ) {
    await this.assertOwnsStudent(teacherId, studentId, isAdmin)
    return this.learning.setLessonUnlocks(studentId, lessonIds, teacherId, unlock)
  }

  /** Intentos de checkpoints del estudiante (con corrección detallada). */
  async studentCheckpointAttempts(teacherId: string, studentId: string, isAdmin = false) {
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
    return this.prisma.checkpointAttempt.findMany({
      where: { userId: studentId },
      orderBy: { createdAt: 'desc' },
      include: {
        checkpoint: {
          select: {
            id: true, fromLevel: true, toLevel: true, passingScore: true,
            module: { select: { id: true, title: true } },
          },
        },
      },
    })
  }

  /**
   * Link de Meet/Zoom del estudiante (lo fija su profesor). El estudiante lo
   * usa en "Entrar a clase" y el profe lo ve en sus próximas clases.
   */
  async setStudentMeetingUrl(teacherId: string, studentId: string, url: string | null, isAdmin = false) {
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
    // Tope defensivo: una invitación de correo cabe de sobra en 20k y evita
    // que un cuerpo de 5 MB haga trabajar al regex sobre todo el texto.
    const raw = (url ?? '').trim().slice(0, 20_000)
    let clean: string | null = null
    if (raw) {
      // Los profes pegan la invitación COMPLETA de Zoom/Meet ("X is inviting
      // you to a scheduled Zoom meeting… https://us05web.zoom.us/j/…"), no la
      // URL sola: se extrae el primer enlace https del texto en vez de
      // rechazar todo. Se limpia la puntuación final que arrastra el correo.
      // El cuantificador va acotado y el recorte se hace carácter a carácter:
      // con `[.,;:)\]>]+$` el backtracking era cuadrático sobre una cadena
      // larga de puntuación y bloqueaba el event loop de toda la API.
      let found = raw.match(/https:\/\/[^\s<>"']{1,2000}/i)?.[0]
      while (found && /[.,;:)\]>]/.test(found[found.length - 1]!)) {
        found = found.slice(0, -1)
      }
      if (!found) {
        throw new BadRequestException(
          'No encontramos ningún link https:// en lo que pegaste. Pega el enlace de la reunión (o el texto completo de la invitación, nosotros extraemos el link).',
        )
      }
      clean = found
    }
    return this.prisma.user.update({
      where: { id: studentId },
      data: { meetingUrl: clean },
      select: { id: true, meetingUrl: true },
    })
  }

  // ─── Calendario del profesor (SDD-scheduling-v2 §8) ──────────────────
  private static readonly BOG_MS = 5 * 60 * 60 * 1000

  private bogotaParts(d: Date): { weekday: number; hour: number } {
    const b = new Date(d.getTime() - TeachersService.BOG_MS)
    return { weekday: b.getUTCDay(), hour: b.getUTCHours() }
  }

  async calendar(teacherId: string, from: Date, to: Date) {
    const [classes, absences] = await Promise.all([
      this.prisma.class.findMany({
        where: { teacherId, startsAt: { gte: from, lt: to } },
        include: {
          student: { select: { id: true, fullName: true, meetingUrl: true, subscription: { select: { status: true } } } },
        },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.teacherAbsence.findMany({
        where: { teacherId, endsAt: { gte: from }, startsAt: { lt: to } },
      }),
    ])
    return {
      classes: classes.map((c) => ({
        id: c.id,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        status: c.status,
        autoValidated: c.autoValidated,
        // meetingUrl de la clase = ruta del board (aula); el link externo de
        // Meet/Zoom vive en student.meetingUrl.
        meetingUrl: c.meetingUrl,
        student: {
          id: c.student.id,
          fullName: c.student.fullName,
          meetingUrl: c.student.meetingUrl,
          paymentActive: c.student.subscription?.status === 'active',
        },
      })),
      absences,
    }
  }

  /**
   * Reprogramación por el profesor (drag & drop). scope:
   *  - 'once'   → mueve SOLO esa clase; no toca el slot recurrente (AC-18).
   *  - 'forever'→ mueve el ScheduleSlot + todas las clases futuras (AC-19).
   */
  async rescheduleClass(teacherId: string, classId: string, newStartsAt: Date, scope: 'once' | 'forever') {
    const c = await this.prisma.class.findUnique({ where: { id: classId } })
    if (!c) throw new NotFoundException('Clase no encontrada')
    if (c.teacherId !== teacherId) throw new ForbiddenException('La clase no es tuya')
    if (isNaN(newStartsAt.getTime())) throw new BadRequestException('Fecha inválida')
    if (c.status === 'cancelled') throw new BadRequestException('Esta clase está cancelada, no se puede mover')
    // Conserva la duración real de la clase (puede no ser 50 min).
    const durMs = c.endsAt.getTime() - c.startsAt.getTime()
    const newEndsAt = new Date(newStartsAt.getTime() + (durMs > 0 ? durMs : 50 * 60 * 1000))

    // Ventana operativa (días y horas). El scope `forever` ya la validaba más
    // abajo; `once` NO, y por ese hueco una clase se fue a un sábado: quedó
    // fuera de nómina y, como el calendario del profe oculta el fin de semana,
    // invisible e imposible de volver a mover desde su portal.
    assertDentroDeLaVentana(newStartsAt, newEndsAt, await this.slots.getConfig())

    // AC-20: no soltar sobre otra clase del profe.
    const clash = await this.prisma.class.findFirst({
      where: {
        teacherId,
        id: { not: classId },
        status: { in: ['scheduled', 'rescheduled'] },
        startsAt: { lt: newEndsAt },
        endsAt: { gt: newStartsAt },
      },
      select: { id: true },
    })
    if (clash) throw new BadRequestException('Ya tienes una clase en ese horario')

    const student = await this.prisma.user.findUnique({
      where: { id: c.studentId },
      select: { id: true, email: true, fullName: true },
    })
    const fmt = (d: Date) =>
      new Date(d.getTime() - TeachersService.BOG_MS).toISOString().slice(0, 16).replace('T', ' ')

    if (scope === 'once') {
      const updated = await this.prisma.class.update({
        where: { id: classId },
        data: {
          startsAt: newStartsAt,
          endsAt: newEndsAt,
          status: 'rescheduled',
          // Deja de estar congelada y deja de contar como tomada: se va a dar
          // en la fecha nueva. Sin esto, mover una clase que el job ya había
          // auto-validado la dejaba cobrada en nómina en su fecha vieja.
          frozenAt: null,
          freezeReason: null,
          validatedAt: null,
          autoValidated: false,
          teacherValidatedAt: null,
          studentConfirmedAt: null,
        },
      })
      if (student) {
        await this.notifications.enqueue({
          userId: student.id,
          toEmail: student.email,
          template: 'class_rescheduled',
          subject: 'Tu clase cambió de horario',
          dedupeKey: `teacher-reschedule-once:${classId}:${newStartsAt.toISOString()}`,
          vars: { fullName: student.fullName, newDate: fmt(newStartsAt) },
          type: 'class',
          title: 'Clase reprogramada',
          body: `Tu profesor movió la clase a ${fmt(newStartsAt)} (solo esta semana).`,
          linkUrl: '/app/calendar',
        })
      }
      return { scope, class: updated }
    }

    // scope === 'forever'
    const oldParts = this.bogotaParts(c.startsAt)
    const newParts = this.bogotaParts(newStartsAt)
    const cfg = await this.slots.getConfig()
    if (!cfg.days.includes(newParts.weekday)) throw new BadRequestException('Día fuera de la ventana permitida')
    if (newParts.hour < cfg.startHour || newParts.hour > cfg.endHour) {
      throw new BadRequestException('Hora fuera de la ventana permitida')
    }
    // Franja recurrente destino libre (puede ser del mismo estudiante). Una
    // clase de más de 60 min ocupa también la(s) franja(s) siguiente(s), así
    // que el chequeo cubre todas las horas que abarca la clase.
    const durMin = Math.max(1, Math.round(durMs > 0 ? durMs / 60_000 : 50))
    const span = Math.max(1, Math.ceil(durMin / 60))
    if (newParts.hour + span - 1 > cfg.endHour) {
      throw new BadRequestException(
        `Una clase de ${durMin} min que empieza a las ${newParts.hour}:00 se sale de la ventana de horario`,
      )
    }
    // Igual que en el alta admin: la disponibilidad pintada del profe debe
    // cubrir el intervalo completo de la clase en el destino. Aplica a
    // cualquier duración: antes solo corría con más de 60 min, y por ese hueco
    // se podía mover una clase de 50 a una hora sin pintar.
    const avail = await this.prisma.teacherAvailability.findMany({ where: { teacherId } })
    if (!availabilityCovers(avail, newParts.weekday, newParts.hour, durMin)) {
      const detalle =
        span > 1
          ? `pinta las horas seguidas (${newParts.hour}:00 y ${newParts.hour + span - 1}:00)`
          : `pinta esa hora`
      throw new BadRequestException(
        `No tienes disponibilidad para una clase de ${durMin} min en ese horario: ${detalle} en tu disponibilidad primero.`,
      )
    }
    const spanHours = Array.from({ length: span }, (_, i) => newParts.hour + i)
    const occupied = await this.prisma.scheduleSlot.findFirst({
      where: {
        teacherId,
        weekday: newParts.weekday,
        hour: { in: spanHours },
        status: { in: ['pending', 'active', 'held'] },
        NOT: { studentId: c.studentId },
      },
      select: { id: true },
    })
    if (occupied) throw new BadRequestException('Esa franja recurrente ya está ocupada')

    // Mover (o crear, legacy) el slot recurrente.
    const slot = await this.prisma.scheduleSlot.findFirst({
      where: { teacherId, studentId: c.studentId, weekday: oldParts.weekday, hour: oldParts.hour },
    })
    if (slot) {
      await this.prisma.scheduleSlot.update({
        where: { id: slot.id },
        data: { weekday: newParts.weekday, hour: newParts.hour },
      })
    } else {
      await this.prisma.scheduleSlot.create({
        data: {
          teacherId,
          studentId: c.studentId,
          weekday: newParts.weekday,
          hour: newParts.hour,
          status: 'active',
        },
      })
    }
    // Espejo de lectura en el usuario.
    const u = await this.prisma.user.findUnique({ where: { id: c.studentId }, select: { schedulePreferences: true } })
    const prefs = ((u?.schedulePreferences as any as Array<{ weekday: number; hour: number }>) ?? []).map((b) =>
      b.weekday === oldParts.weekday && b.hour === oldParts.hour ? { weekday: newParts.weekday, hour: newParts.hour } : b,
    )
    await this.prisma.user.update({ where: { id: c.studentId }, data: { schedulePreferences: prefs as any } })

    // Reprogramar TODAS las clases futuras del patrón viejo.
    const future = await this.prisma.class.findMany({
      where: { teacherId, studentId: c.studentId, status: 'scheduled', startsAt: { gte: new Date() } },
    })
    const deltaDays = newParts.weekday - oldParts.weekday
    let moved = 0
    for (const f of future) {
      const parts = this.bogotaParts(f.startsAt)
      if (parts.weekday !== oldParts.weekday || parts.hour !== oldParts.hour) continue
      const wall = new Date(f.startsAt.getTime() - TeachersService.BOG_MS)
      const newWall = Date.UTC(
        wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + deltaDays, newParts.hour, 0, 0,
      )
      const ns = new Date(newWall + TeachersService.BOG_MS)
      if (ns.getTime() <= Date.now()) continue // no mover al pasado (ej. Vie→Lun misma semana)
      // Cada clase conserva su propia duración (puede no ser 50 min).
      const fDurMs = f.endsAt.getTime() - f.startsAt.getTime()
      const ne = new Date(ns.getTime() + (fDurMs > 0 ? fDurMs : 50 * 60 * 1000))
      // El clash del arrastre solo cubrió la instancia arrastrada: cada semana
      // se re-chequea contra las demás clases del profe (una clase larga puede
      // invadir la hora de otro estudiante solo en algunas semanas). Si choca,
      // esa semana se queda donde estaba en vez de crear una doble-reserva.
      const weekClash = await this.prisma.class.findFirst({
        where: {
          teacherId,
          id: { not: f.id },
          status: { in: ['scheduled', 'rescheduled'] },
          startsAt: { lt: ne },
          endsAt: { gt: ns },
        },
        select: { id: true },
      })
      if (weekClash) continue
      await this.prisma.class.update({
        where: { id: f.id },
        data: { startsAt: ns, endsAt: ne },
      })
      moved++
    }
    if (student) {
      await this.notifications.enqueue({
        userId: student.id,
        toEmail: student.email,
        template: 'class_rescheduled',
        subject: 'Tu horario de clases cambió',
        dedupeKey: `teacher-reschedule-forever:${classId}:${newStartsAt.toISOString()}`,
        vars: { fullName: student.fullName, newDate: fmt(newStartsAt) },
        type: 'class',
        title: 'Horario actualizado',
        body: `Tus clases pasan a los ${['domingos','lunes','martes','miércoles','jueves','viernes','sábados'][newParts.weekday]} a las ${newParts.hour}:00.`,
        linkUrl: '/app/calendar',
      })
    }
    return { scope, movedClasses: moved }
  }

  /**
   * Material extra: listado SIN `contentHtml`. El HTML de cada recurso pesa
   * como una lección entera; traerlos todos juntos volvería lentísimo el
   * listado y el profe solo necesita el del que abre.
   */
  async listResources() {
    return this.prisma.teacherResource.findMany({
      where: { published: true },
      orderBy: [{ category: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, title: true, description: true, category: true, updatedAt: true },
    })
  }

  async getResource(id: string) {
    const r = await this.prisma.teacherResource.findFirst({ where: { id, published: true } })
    if (!r) throw new NotFoundException('Material no encontrado')
    return r
  }
}
