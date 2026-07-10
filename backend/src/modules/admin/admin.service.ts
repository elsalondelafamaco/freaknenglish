import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { env } from '../../config/env'
import { JwtService } from '@nestjs/jwt'
import { randomBytes, randomUUID } from 'crypto'
import { StorageService } from '../storage/storage.service'

@Injectable()
export class AdminService {
  private readonly demoUserAliases: Record<string, string> = {
    usr_demo_student: 'estudiante@freakn.dev',
    usr_demo_teacher: 'profe@freakn.dev',
    usr_demo_admin: 'admin@freakn.dev',
  }

  constructor(
    private prisma: PrismaService,
    @InjectQueue('automations') private automationsQueue: Queue,
    private jwt: JwtService,
    private storage: StorageService,
  ) {}

  private async resolveExistingUserId(idOrAlias: string): Promise<string> {
    const byId = await this.prisma.user.findUnique({ where: { id: idOrAlias }, select: { id: true } })
    if (byId) return byId.id

    const email = this.demoUserAliases[idOrAlias] ?? (idOrAlias.includes('@') ? idOrAlias : null)
    if (email) {
      const byEmail = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } })
      if (byEmail) return byEmail.id
    }

    throw new NotFoundException('User not found')
  }

  async analytics() {
    const [activeSubs, plans, surveys, totalClasses, validatedClasses] = await Promise.all([
      this.prisma.subscription.findMany({ where: { status: 'active' }, include: { plan: true } }),
      this.prisma.plan.findMany(),
      this.prisma.satisfactionSurvey.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 }),
      this.prisma.class.count(),
      this.prisma.class.count({ where: { status: 'validated' } }),
    ])
    const mrr = activeSubs.reduce((s, sub) => s + sub.plan.priceCop, 0)
    const promoters = surveys.filter((s) => s.score >= 9).length
    const detractors = surveys.filter((s) => s.score <= 6).length
    const nps = surveys.length ? Math.round(((promoters - detractors) / surveys.length) * 100) : 0
    return {
      mrrCop: mrr,
      activeSubscriptions: activeSubs.length,
      nps,
      surveys: surveys.length,
      attendanceRate: totalClasses ? Math.round((validatedClasses / totalClasses) * 100) : 0,
      byPlan: plans.map((p) => ({
        planId: p.id,
        active: activeSubs.filter((s) => s.planId === p.id).length,
      })),
    }
  }

  users(q?: string) {
    return this.prisma.user.findMany({
      where: q ? { OR: [{ email: { contains: q } }, { fullName: { contains: q } }] } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { subscription: { include: { plan: true } } },
      take: 500,
    })
  }

  // ─── D7 · Métricas admin reales ────────────────────────────────────
  /**
   * Devuelve KPIs agregados y series temporales para el dashboard admin.
   * `range` en días (30/90/365). Todas las series comparten el mismo eje.
   */
  async metrics(rangeDays = 30) {
    const days = Math.min(Math.max(rangeDays, 7), 365)
    const to = new Date()
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000)
    const periodStartMs = from.getTime()

    const [activeSubs, allClasses, payments, surveys, teachers, totalStudents] = await Promise.all([
      this.prisma.subscription.findMany({ where: { status: 'active' }, include: { plan: true } }),
      this.prisma.class.findMany({
        where: { startsAt: { gte: from } },
        select: { id: true, teacherId: true, studentId: true, status: true, startsAt: true, endsAt: true },
      }),
      this.prisma.paymentIntent.findMany({
        where: { status: 'APPROVED', approvedAt: { gte: from } },
        select: { amountInCents: true, currency: true, approvedAt: true },
      }),
      this.prisma.satisfactionSurvey.findMany({
        where: { createdAt: { gte: from } },
        select: { score: true, teacherScore: true },
      }),
      this.prisma.user.findMany({
        where: { role: 'teacher', deletedAt: null },
        select: { id: true, fullName: true },
      }),
      this.prisma.user.count({ where: { role: 'student', deletedAt: null } }),
    ])

    // MRR/ARR
    const mrrCop = activeSubs.reduce((s, sub) => s + sub.plan.priceCop, 0)
    const arrCop = mrrCop * 12

    // Churn: subs canceladas en el rango / activas al inicio del rango
    const [cancelledInRange, activeAtStart] = await Promise.all([
      this.prisma.subscription.count({
        where: { status: 'cancelled', updatedAt: { gte: from, lte: to } },
      }),
      this.prisma.subscription.count({
        where: {
          OR: [
            { status: 'active', createdAt: { lte: from } },
            { status: 'cancelled', updatedAt: { gt: from } },
          ],
        },
      }),
    ])
    const churnRate = activeAtStart ? Math.round((cancelledInRange / activeAtStart) * 1000) / 10 : 0

    // Asistencia
    const validated = allClasses.filter((c) => c.status === 'validated').length
    const scheduledOrDone = allClasses.filter((c) =>
      ['scheduled', 'validated', 'rescheduled', 'no_show'].includes(c.status),
    ).length
    const attendanceRate = scheduledOrDone ? Math.round((validated / scheduledOrDone) * 100) : 0

    // NPS
    const promoters = surveys.filter((s) => s.score >= 9).length
    const detractors = surveys.filter((s) => s.score <= 6).length
    const nps = surveys.length ? Math.round(((promoters - detractors) / surveys.length) * 100) : 0

    // Serie de ingresos por día
    const bucketByDay = new Map<string, number>()
    for (let i = 0; i <= days; i++) {
      const d = new Date(periodStartMs + i * 86400000)
      bucketByDay.set(d.toISOString().slice(0, 10), 0)
    }
    for (const p of payments) {
      if (!p.approvedAt) continue
      const k = p.approvedAt.toISOString().slice(0, 10)
      bucketByDay.set(k, (bucketByDay.get(k) ?? 0) + p.amountInCents)
    }
    const revenueSeries = Array.from(bucketByDay.entries()).map(([date, cents]) => ({ date, cents }))
    const revenueCop = payments.reduce((s, p) => s + p.amountInCents, 0) / 100

    // Serie de clases validadas por día
    const classesByDay = new Map<string, number>()
    for (const [k] of bucketByDay) classesByDay.set(k, 0)
    for (const c of allClasses) {
      if (c.status !== 'validated') continue
      const k = c.startsAt.toISOString().slice(0, 10)
      if (classesByDay.has(k)) classesByDay.set(k, (classesByDay.get(k) ?? 0) + 1)
    }
    const classesSeries = Array.from(classesByDay.entries()).map(([date, count]) => ({ date, count }))

    // Top profesores por clases validadas + horas
    const teacherStats = new Map<string, { validated: number; minutes: number }>()
    for (const c of allClasses) {
      if (!c.teacherId || c.status !== 'validated') continue
      const cur = teacherStats.get(c.teacherId) ?? { validated: 0, minutes: 0 }
      cur.validated += 1
      cur.minutes += Math.round((c.endsAt.getTime() - c.startsAt.getTime()) / 60000)
      teacherStats.set(c.teacherId, cur)
    }
    const topTeachers = teachers
      .map((t) => ({
        id: t.id,
        fullName: t.fullName,
        validatedClasses: teacherStats.get(t.id)?.validated ?? 0,
        hours: Math.round(((teacherStats.get(t.id)?.minutes ?? 0) / 60) * 10) / 10,
      }))
      .sort((a, b) => b.validatedClasses - a.validatedClasses)
      .slice(0, 10)

    // Retención cohortes (últimos 6 meses):
    // cohorte = mes en que el estudiante activó suscripción
    // retenido = tuvo al menos 1 clase validada en el mes N
    const cohorts = await this.retentionCohorts(6)

    return {
      range: { from: from.toISOString(), to: to.toISOString(), days },
      mrrCop,
      arrCop,
      activeSubscriptions: activeSubs.length,
      totalStudents,
      churnRate,
      attendanceRate,
      nps,
      surveys: surveys.length,
      revenueCop,
      revenueSeries,
      classesSeries,
      topTeachers,
      cohorts,
    }
  }

  private async retentionCohorts(months: number) {
    const now = new Date()
    const cohortStart = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
    const subs = await this.prisma.subscription.findMany({
      where: { createdAt: { gte: cohortStart } },
      select: { userId: true, createdAt: true },
    })
    if (subs.length === 0) return [] as any[]

    const cohortMap = new Map<string, Set<string>>() // 'YYYY-MM' -> userIds
    for (const s of subs) {
      const key = s.createdAt.toISOString().slice(0, 7)
      const set = cohortMap.get(key) ?? new Set<string>()
      set.add(s.userId)
      cohortMap.set(key, set)
    }

    const allUserIds = Array.from(new Set(subs.map((s) => s.userId)))
    const validated = await this.prisma.class.findMany({
      where: { studentId: { in: allUserIds }, status: 'validated', startsAt: { gte: cohortStart } },
      select: { studentId: true, startsAt: true },
    })

    return Array.from(cohortMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cohort, users]) => {
        const cohortDate = new Date(cohort + '-01')
        const buckets: number[] = []
        for (let m = 0; m < months; m++) {
          const start = new Date(cohortDate.getFullYear(), cohortDate.getMonth() + m, 1)
          const end = new Date(cohortDate.getFullYear(), cohortDate.getMonth() + m + 1, 1)
          if (start > now) break
          const retained = new Set<string>()
          for (const v of validated) {
            if (!users.has(v.studentId)) continue
            if (v.startsAt >= start && v.startsAt < end) retained.add(v.studentId)
          }
          buckets.push(Math.round((retained.size / users.size) * 100))
        }
        return { cohort, size: users.size, retention: buckets }
      })
  }

  // ─── Payroll (config + cálculo por horas) ─────────────────────────────

  private async getHourlyRateCop(): Promise<number> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: 'payroll.hourlyRateCop' } as any }).catch(() => null as any)
    const stored = row?.value as any
    const fromDb = typeof stored === 'number' ? stored : Number(stored?.value ?? NaN)
    return Number.isFinite(fromDb) && fromDb > 0 ? fromDb : env.TEACHER_PAYRATE_COP
  }

  async getPayrollSettings() {
    return { hourlyRateCop: await this.getHourlyRateCop() }
  }

  async setPayrollSettings(hourlyRateCop: number) {
    if (!Number.isFinite(hourlyRateCop) || hourlyRateCop <= 0) throw new Error('Invalid hourly rate')
    await this.prisma.appSetting.upsert({
      where: { key: 'payroll.hourlyRateCop' },
      update: { value: hourlyRateCop as any },
      create: { key: 'payroll.hourlyRateCop', value: hourlyRateCop as any },
    })
    return { hourlyRateCop }
  }

  async payroll(period: string) {
    const [year, month] = period.split('-').map(Number)
    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 1)
    const classes = await this.prisma.class.findMany({
      where: { status: 'validated', validatedAt: { gte: start, lt: end }, teacherId: { not: null } },
      select: { teacherId: true, startsAt: true, endsAt: true },
    })
    // Acumulamos minutos por profesor (las clases validadas se pagan por hora real).
    const minutes = new Map<string, number>()
    const counts = new Map<string, number>()
    for (const c of classes) {
      const tid = c.teacherId!
      const durMin = Math.max(
        0,
        Math.round((c.endsAt.getTime() - c.startsAt.getTime()) / 60000),
      ) || 60
      minutes.set(tid, (minutes.get(tid) ?? 0) + durMin)
      counts.set(tid, (counts.get(tid) ?? 0) + 1)
    }
    const teacherIds = Array.from(minutes.keys())
    const teachers = await this.prisma.user.findMany({ where: { id: { in: teacherIds } } })
    const hourlyRate = await this.getHourlyRateCop()
    return teachers.map((t) => {
      const mins = minutes.get(t.id) ?? 0
      const hours = mins / 60
      return {
        teacherId: t.id,
        fullName: t.fullName,
        classes: counts.get(t.id) ?? 0,
        minutes: mins,
        hours: Number(hours.toFixed(2)),
        hourlyRateCop: hourlyRate,
        amountCop: Math.round(hours * hourlyRate),
      }
    })
  }

  async payrollCsv(period: string) {
    const rows = await this.payroll(period)
    const header = 'teacher_id,full_name,classes,hours,hourly_rate_cop,amount_cop'
    const body = rows
      .map((r) => [r.teacherId, JSON.stringify(r.fullName), r.classes, r.hours, r.hourlyRateCop, r.amountCop].join(','))
      .join('\n')
    return `${header}\n${body}\n`
  }

  content() {
    return this.prisma.module.findMany({
      orderBy: [{ level: 'asc' }, { position: 'asc' }],
      include: { lessons: { orderBy: { position: 'asc' } }, checkpoints: true },
    })
  }

  notifications(status?: 'queued' | 'sent' | 'failed') {
    return this.prisma.notification.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
  }

  async runAutomationsManually() {
    await this.automationsQueue.add('tick-5m', { manual: true }, { removeOnComplete: true })
    await this.automationsQueue.add('tick-daily', { manual: true }, { removeOnComplete: true })
    return { ok: true, enqueued: ['tick-5m', 'tick-daily'] }
  }

  async surveys(filter?: 'promoters' | 'detractors' | 'all') {
    const where =
      filter === 'promoters'
        ? { score: { gte: 9 } }
        : filter === 'detractors'
          ? { score: { lte: 6 } }
          : {}
    const rows = await this.prisma.satisfactionSurvey.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        user: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    })
    const promoters = rows.filter((r) => r.score >= 9).length
    const detractors = rows.filter((r) => r.score <= 6).length
    const nps = rows.length ? Math.round(((promoters - detractors) / rows.length) * 100) : null
    return { rows, totals: { count: rows.length, promoters, detractors, nps } }
  }

  /**
   * Crea un usuario sin contraseña: dispara email "set-password" vía Resend.
   * El estudiante no queda activo hasta completar pago Wompi.
   */
  async createUser(input: { email: string; fullName: string; role: 'student' | 'teacher'; level?: 'beginner' | 'intermediate' | 'advanced' }) {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } })
    if (exists) throw new Error('User already exists')
    const setPasswordToken = randomBytes(32).toString('hex')
    const user = await this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        fullName: input.fullName,
        role: input.role,
        englishLevel: input.level,
        passwordHash: '',
        // setPasswordToken se guarda en tabla `password_reset_tokens` con TTL 7 días.
      },
    })
    // TODO emails: enqueue('emails', { template: 'set-password', to: user.email, ctx: { token: setPasswordToken } })
    return { user, setPasswordToken }
  }

  /**
   * Asigna (o limpia) un profesor para un estudiante.
   * Requiere columna `assignedTeacherId` en `User` (Prisma migration).
   */
  async assignTeacher(studentId: string, teacherId: string | null) {
    const resolvedStudentId = await this.resolveExistingUserId(studentId)
    let resolvedTeacherId: string | null = null

    if (teacherId) {
      resolvedTeacherId = await this.resolveExistingUserId(teacherId)
      const t = await this.prisma.user.findUnique({ where: { id: resolvedTeacherId } })
      if (!t || t.role !== 'teacher') throw new Error('Invalid teacher')
    }

    return this.prisma.user.update({
      where: { id: resolvedStudentId },
      data: { assignedTeacherId: resolvedTeacherId },
    })
  }

  /**
   * Genera un JWT de impersonación que dura 30 min y registra log de auditoría.
   * Claim adicional `actAs` + `impersonatorId` para que el frontend pueda
   * mostrar el banner y permitir regresar.
   */
  async impersonate(adminId: string, targetId: string) {
    const resolvedTargetId = await this.resolveExistingUserId(targetId)
    const target = await this.prisma.user.findUnique({ where: { id: resolvedTargetId } })
    if (!target) throw new Error('Target not found')
    await this.prisma.impersonationLog.create({ data: { adminId, targetId } }).catch(() => null)
    const accessToken = await this.jwt.signAsync(
      { sub: target.id, role: target.role, impersonatorId: adminId, actAs: target.id },
      { expiresIn: '30m' },
    )
    return { accessToken, target: { id: target.id, fullName: target.fullName, role: target.role } }
  }

  // ────────────────────────────────────────────────────────────────────────
  // CRM · detalle, edición, estado, soft delete, reset password
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Devuelve TODO lo necesario para pintar el perfil completo en `/admin/users/:id`.
   * - Profesor: estudiantes asignados, NPS recibido (de sus clases), nómina del mes.
   * - Estudiante: profesor asignado, suscripción, pagos, clases, progreso, NPS, notas.
   */
  async userDetail(id: string) {
    const resolvedId = await this.resolveExistingUserId(id)
    const user = await this.prisma.user.findUnique({
      where: { id: resolvedId },
      include: {
        subscription: { include: { plan: true } },
        assignedTeacher: { select: { id: true, fullName: true, email: true } },
      },
    })
    if (!user) throw new Error('User not found')

    const isTeacher = user.role === 'teacher'
    const isStudent = user.role === 'student'

    const [payments, classesAsStudent, classesAsTeacher, surveys, progress, notesByTeacher, notesAboutStudent, assignedStudents] =
      await Promise.all([
        this.prisma.paymentIntent.findMany({ where: { userId: resolvedId }, orderBy: { createdAt: 'desc' }, take: 50 }),
        isStudent
          ? this.prisma.class.findMany({
              where: { studentId: resolvedId },
              orderBy: { startsAt: 'desc' },
              take: 50,
              include: { teacher: { select: { id: true, fullName: true } } },
            })
          : Promise.resolve([] as any[]),
        isTeacher
          ? this.prisma.class.findMany({
              where: { teacherId: resolvedId },
              orderBy: { startsAt: 'desc' },
              take: 50,
              include: { student: { select: { id: true, fullName: true } } },
            })
          : Promise.resolve([] as any[]),
        this.prisma.satisfactionSurvey.findMany({ where: { userId: resolvedId }, orderBy: { createdAt: 'desc' }, take: 20 }),
        isStudent
          ? this.prisma.lessonProgress.findMany({
              where: { userId: resolvedId, completedAt: { not: null } },
              include: { lesson: { select: { id: true, title: true, moduleId: true } } },
              orderBy: { updatedAt: 'desc' },
              take: 100,
            })
          : Promise.resolve([] as any[]),
        isTeacher
          ? this.prisma.classNote.findMany({ where: { teacherId: resolvedId }, orderBy: { createdAt: 'desc' }, take: 50 })
          : Promise.resolve([] as any[]),
        isStudent
          ? this.prisma.classNote.findMany({
              where: { class: { studentId: resolvedId } } as any,
              orderBy: { createdAt: 'desc' },
              take: 50,
              include: { teacher: { select: { id: true, fullName: true } } },
            })
          : Promise.resolve([] as any[]),
        isTeacher
          ? this.prisma.user.findMany({
              where: { assignedTeacherId: resolvedId, deletedAt: null },
              select: { id: true, fullName: true, email: true, englishLevel: true, disabledAt: true },
            })
          : Promise.resolve([] as any[]),
      ])

    return {
      user,
      payments,
      classes: isStudent ? classesAsStudent : classesAsTeacher,
      surveys, // sólo admin las verá — el guard ya bloquea profesores
      progress,
      notes: isStudent ? notesAboutStudent : notesByTeacher,
      assignedStudents,
    }
  }

  async updateUser(
    id: string,
    data: { fullName?: string; phone?: string; role?: 'student' | 'teacher' | 'admin'; englishLevel?: 'beginner' | 'intermediate' | 'advanced' | null },
  ) {
    const resolvedId = await this.resolveExistingUserId(id)
    return this.prisma.user.update({ where: { id: resolvedId }, data: data as any })
  }

  async setUserStatus(id: string, disabled: boolean) {
    const resolvedId = await this.resolveExistingUserId(id)
    return this.prisma.user.update({
      where: { id: resolvedId },
      data: { disabledAt: disabled ? new Date() : null },
    })
  }

  async softDeleteUser(id: string) {
    const resolvedId = await this.resolveExistingUserId(id)
    return this.prisma.user.update({ where: { id: resolvedId }, data: { deletedAt: new Date(), disabledAt: new Date() } })
  }

  /**
   * Genera token de reset (TTL 24h), persiste en `password_resets` y devuelve
   * el link para que el caller (o un job) envíe el email vía Resend.
   */
  async resetUserPassword(id: string) {
    const resolvedId = await this.resolveExistingUserId(id)
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24)
    await this.prisma.passwordReset.create({ data: { userId: resolvedId, tokenHash: token, expiresAt } as any })
    const link = `${env.PUBLIC_SITE_URL}/reset-password?token=${token}`
    // TODO emails: enqueue('emails', { template: 'reset-password', to: user.email, ctx: { link } })
    return { ok: true, link, expiresAt }
  }

  // ────────────────────────────────────────────────────────────────────────
  // CMS · módulos, lecciones, adjuntos
  // ────────────────────────────────────────────────────────────────────────

  async saveModule(input: { id?: string; level: 'beginner' | 'intermediate' | 'advanced'; title: string; summary?: string; position?: number }) {
    const id = input.id ?? randomUUID()
    const existing = await this.prisma.module.findUnique({ where: { id } })
    if (existing) {
      return this.prisma.module.update({
        where: { id },
        data: {
          title: input.title ?? existing.title,
          description: input.summary ?? existing.description,
          level: (input.level ?? existing.level) as any,
          position: input.position ?? existing.position,
        },
      })
    }
    const last = await this.prisma.module.findFirst({ where: { level: input.level as any }, orderBy: { position: 'desc' } })
    return this.prisma.module.create({
      data: {
        id,
        title: input.title,
        description: input.summary ?? '',
        level: input.level as any,
        position: input.position ?? (last ? last.position + 1 : 1),
      },
    })
  }

  async deleteModule(id: string) {
    await this.prisma.module.delete({ where: { id } })
    return { ok: true }
  }

  async saveLesson(input: any) {
    const id = input.id ?? randomUUID()
    const existing = await this.prisma.lesson.findUnique({ where: { id } })
    const data = {
      title: input.title ?? existing?.title,
      kind: input.kind ?? existing?.kind ?? 'video',
      durationMin: input.durationMin ?? existing?.durationMin ?? 15,
      videoUrl: input.videoUrl ?? existing?.videoUrl,
      pdfUrl: input.pdfUrl ?? existing?.pdfUrl,
      slidesUrl: input.slidesUrl ?? existing?.slidesUrl,
      contentHtml: input.contentHtml ?? existing?.contentHtml,
      notes: input.notes ?? existing?.notes,
    }
    if (existing) {
      return this.prisma.lesson.update({ where: { id }, data: data as any })
    }
    if (!input.moduleId) throw new Error('moduleId required')
    const last = await this.prisma.lesson.findFirst({ where: { moduleId: input.moduleId }, orderBy: { position: 'desc' } })
    return this.prisma.lesson.create({
      data: {
        id,
        moduleId: input.moduleId,
        position: input.position ?? (last ? last.position + 1 : 1),
        ...data,
      } as any,
    })
  }

  async deleteLesson(id: string) {
    await this.prisma.lesson.delete({ where: { id } })
    return { ok: true }
  }

  signUpload(body: { filename: string; contentType?: string; lessonId?: string }) {
    return this.storage.signUpload({
      filename: body.filename,
      contentType: body.contentType,
      prefix: body.lessonId ? `lessons/${body.lessonId}` : 'cms/uploads',
    })
  }

  attachLessonFile(
    lessonId: string,
    body: { name: string; storageKey: string; url: string; contentType?: string; sizeBytes?: number },
  ) {
    return this.prisma.lessonAttachment.create({
      data: {
        lessonId,
        name: body.name,
        storageKey: body.storageKey,
        url: body.url,
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
      },
    })
  }

  async deleteAttachment(id: string) {
    const att = await this.prisma.lessonAttachment.findUnique({ where: { id } })
    if (!att) return { ok: true }
    await this.storage.delete(att.storageKey)
    await this.prisma.lessonAttachment.delete({ where: { id } })
    return { ok: true }
  }
}
