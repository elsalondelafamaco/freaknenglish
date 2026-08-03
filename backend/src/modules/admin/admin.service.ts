import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { AppRole, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { IS_TEACHER, hasRole } from '../../common/roles'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { env } from '../../config/env'
import { JwtService } from '@nestjs/jwt'
import { randomBytes, randomUUID, createHash } from 'crypto'
import { StorageService } from '../storage/storage.service'
import { NotificationsService } from '../notifications/notifications.service'
import { SchedulingService } from '../scheduling/scheduling.service'
import { SlotsService, SlotRef } from '../scheduling/slots.service'
import { validateQuestion } from '../learning/checkpoint-questions'

@Injectable()
export class AdminService {
  private readonly log = new Logger(AdminService.name)
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
    private notificationsSvc: NotificationsService,
    private schedulingSvc: SchedulingService,
    private slotsSvc: SlotsService,
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
        where: { ...IS_TEACHER, deletedAt: null },
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
        where: { status: 'canceled', updatedAt: { gte: from, lte: to } },
      }),
      this.prisma.subscription.count({
        where: {
          OR: [
            { status: 'active', createdAt: { lte: from } },
            { status: 'canceled', updatedAt: { gt: from } },
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

    // Pagos fallidos en el rango (finanzas).
    const failedPayments = await this.prisma.paymentIntent.count({
      where: { status: { in: ['DECLINED', 'VOIDED', 'ERROR'] }, createdAt: { gte: from } },
    })

    // Módulos donde los estudiantes se estancan: agrupa a cada estudiante por
    // el módulo de su última lección completada (dónde está "parado" hoy).
    const completedProgress = await this.prisma.lessonProgress.findMany({
      where: { completedAt: { not: null } },
      select: { userId: true, updatedAt: true, lesson: { select: { moduleId: true, module: { select: { title: true } } } } },
      orderBy: { updatedAt: 'desc' },
    })
    const latestByUser = new Map<string, { moduleId: string; title: string }>()
    for (const pr of completedProgress) {
      if (latestByUser.has(pr.userId)) continue
      latestByUser.set(pr.userId, { moduleId: pr.lesson.moduleId, title: pr.lesson.module?.title ?? pr.lesson.moduleId })
    }
    const stuckMap = new Map<string, { title: string; students: number }>()
    for (const { moduleId, title } of latestByUser.values()) {
      const cur = stuckMap.get(moduleId) ?? { title, students: 0 }
      cur.students += 1
      stuckMap.set(moduleId, cur)
    }
    const stuckModules = Array.from(stuckMap.entries())
      .map(([moduleId, v]) => ({ moduleId, title: v.title, students: v.students }))
      .sort((a, b) => b.students - a.students)
      .slice(0, 10)

    return {
      range: { from: from.toISOString(), to: to.toISOString(), days },
      failedPayments,
      stuckModules,
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

  // ─── Payroll (config + cálculo POR CLASE) ─────────────────────────────
  // La tarifa es por CLASE completa: una clase de 50 min paga la tarifa
  // entera, sin prorratear por minutos. (Se mantiene la clave histórica
  // `payroll.hourlyRateCop` en app_settings para no migrar datos.)

  private async getClassRateCop(): Promise<number> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: 'payroll.hourlyRateCop' } as any }).catch(() => null as any)
    const stored = row?.value as any
    const fromDb = typeof stored === 'number' ? stored : Number(stored?.value ?? NaN)
    return Number.isFinite(fromDb) && fromDb > 0 ? fromDb : env.TEACHER_PAYRATE_COP
  }

  async getPayrollSettings() {
    return { hourlyRateCop: await this.getClassRateCop() }
  }

  async setPayrollSettings(hourlyRateCop: number) {
    if (!Number.isFinite(hourlyRateCop) || hourlyRateCop <= 0) throw new Error('Invalid class rate')
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
      // validated (tomadas) + no_show (ausencia del estudiante: el profe
      // estuvo presente, se paga igual). Las no_show se ubican por endsAt.
      where: {
        teacherId: { not: null },
        OR: [
          { status: 'validated', validatedAt: { gte: start, lt: end } },
          { status: 'no_show', endsAt: { gte: start, lt: end } },
        ],
      },
      select: { teacherId: true, startsAt: true, endsAt: true },
    })
    // Tarifa POR CLASE: cada clase validada paga la tarifa completa aunque
    // dure 50 min. Minutos/horas se reportan solo como dato informativo.
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
    const classRate = await this.getClassRateCop()
    return teachers.map((t) => {
      const mins = minutes.get(t.id) ?? 0
      const count = counts.get(t.id) ?? 0
      return {
        teacherId: t.id,
        fullName: t.fullName,
        classes: count,
        minutes: mins,
        hours: Number((mins / 60).toFixed(2)),
        hourlyRateCop: classRate,
        amountCop: count * classRate,
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

  // ─── Nómina · persistencia (PayrollRun) + dispersión Wompi ────────────
  /**
   * Calcula y PERSISTE la nómina del período como filas `PayrollRun`
   * (una por profesor, status inicial `pending`). Idempotente por
   * (period, teacherId): re-generar actualiza montos pero respeta las ya
   * pagadas. La dispersión NO es automática: el admin revisa y aprueba/paga
   * cada profesor (ver `payPayrollRun`).
   */
  async generatePayrollRuns(period: string) {
    const rows = await this.payroll(period)
    for (const r of rows) {
      const existing = await this.prisma.payrollRun.findUnique({
        where: { period_teacherId: { period, teacherId: r.teacherId } },
      })
      if (existing?.status === 'paid') continue
      await this.prisma.payrollRun.upsert({
        where: { period_teacherId: { period, teacherId: r.teacherId } },
        update: { classes: r.classes, rateCop: r.hourlyRateCop, amountCop: r.amountCop },
        create: {
          period,
          teacherId: r.teacherId,
          classes: r.classes,
          rateCop: r.hourlyRateCop,
          amountCop: r.amountCop,
          status: 'pending',
        },
      })
    }
    return this.listPayrollRuns(period)
  }

  async listPayrollRuns(period: string) {
    const runs = await this.prisma.payrollRun.findMany({
      where: { period },
      orderBy: { amountCop: 'desc' },
    })
    const teachers = await this.prisma.user.findMany({
      where: { id: { in: runs.map((r) => r.teacherId) } },
      select: { id: true, fullName: true, email: true },
    })
    const byId = new Map(teachers.map((t) => [t.id, t]))
    return runs.map((r) => ({ ...r, teacher: byId.get(r.teacherId) ?? null }))
  }

  /**
   * Marca una corrida de nómina como pagada. Si `WOMPI_PAYOUTS_ENABLED=true`
   * intenta la dispersión vía Wompi; si no (default), queda como pago manual
   * registrado por el admin. Decisión de producto: dispersión automática vía
   * Wompi PERO disparada tras la aprobación/revisión del admin, nunca sola.
   */
  /**
   * Ajuste manual sobre el valor final de una corrida (bono, descuento,
   * corrección). Positivo suma, negativo resta. Exige nota: el ajuste sin
   * explicación es imposible de auditar tres meses después.
   */
  async adjustPayrollRun(id: string, adjustmentCop: number, note: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id } })
    if (!run) throw new NotFoundException('Payroll run not found')
    if (run.status === 'paid') {
      throw new BadRequestException('No se puede ajustar una nómina ya pagada')
    }
    if (!note?.trim()) throw new BadRequestException('El ajuste necesita una nota que lo explique')
    const monto = Math.round(Number(adjustmentCop) || 0)
    if (run.amountCop + monto < 0) {
      throw new BadRequestException('El ajuste dejaría el pago en negativo')
    }
    return this.prisma.payrollRun.update({
      where: { id },
      data: { adjustmentCop: monto, adjustmentNote: note.trim() },
    })
  }

  /** Datos bancarios del profesor para dispersar su nómina. */
  async setTeacherPayoutAccount(
    teacherId: string,
    cuenta: { bankCode?: string; accountType?: string; accountNumber?: string } | null,
  ) {
    const limpia =
      cuenta && cuenta.accountNumber && cuenta.bankCode
        ? {
            bankCode: String(cuenta.bankCode).trim(),
            accountType: cuenta.accountType === 'CHECKING' ? 'CHECKING' : 'SAVINGS',
            accountNumber: String(cuenta.accountNumber).trim(),
          }
        : null
    const user = await this.prisma.user.update({
      where: { id: teacherId },
      data: { payoutAccount: (limpia ?? Prisma.DbNull) as any },
      select: { id: true, payoutAccount: true },
    })
    return user
  }

  /** Total a pagar de una corrida: lo calculado más el ajuste manual. */
  private totalAPagar(run: { amountCop: number; adjustmentCop?: number | null }) {
    return run.amountCop + (run.adjustmentCop ?? 0)
  }

  /**
   * Paga TODAS las corridas pendientes del período, una por una. Cada pago es
   * independiente: si la dispersión de un profesor falla, ese queda registrado
   * con su error y el resto sigue — no se aborta el lote entero por uno.
   */
  async payAllPayrollRuns(period: string) {
    const pendientes = await this.prisma.payrollRun.findMany({
      where: { period, status: 'pending' },
    })
    const resultados = []
    for (const run of pendientes) {
      try {
        const r = await this.payPayrollRun(run.id)
        resultados.push({ id: run.id, teacherId: run.teacherId, ok: true, dispersed: (r as any).dispersed })
      } catch (e) {
        this.log.error(`[nomina] falló el pago de ${run.id}: ${(e as Error).message}`)
        resultados.push({ id: run.id, teacherId: run.teacherId, ok: false, error: (e as Error).message })
      }
    }
    return {
      periodo: period,
      intentados: pendientes.length,
      pagados: resultados.filter((r) => r.ok).length,
      fallidos: resultados.filter((r) => !r.ok).length,
      totalCop: pendientes.reduce((s, r) => s + this.totalAPagar(r), 0),
      resultados,
    }
  }

  async payPayrollRun(id: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id } })
    if (!run) throw new NotFoundException('Payroll run not found')
    if (run.status === 'paid') return run
    const total = this.totalAPagar(run)
    const payout = await this.dispersePayrollRun({ ...run, amountCop: total })
    // El pago SIEMPRE queda registrado en la plataforma, dispersara o no:
    // la nómina es la fuente de verdad y Wompi es solo el medio. Si la
    // dispersión falla, se guarda el motivo para reintentarla o pagarla a mano.
    const updated = await this.prisma.payrollRun.update({
      where: { id },
      data: {
        status: 'paid',
        paidAt: new Date(),
        paidMethod: payout.dispersed ? 'wompi' : 'manual',
        payoutRef: payout.reference ?? null,
        payoutError: payout.error ?? null,
      },
    })
    // Comprobante al profesor con el detalle del pago y sus clases.
    const teacher = await this.prisma.user.findUnique({
      where: { id: run.teacherId },
      select: { id: true, email: true, fullName: true },
    })
    if (teacher) {
      await this.notificationsSvc.enqueue({
        userId: teacher.id,
        toEmail: teacher.email,
        template: 'payroll_paid',
        subject: `Tu pago de ${run.period} fue aprobado 🎉`,
        dedupeKey: `payroll-paid:${run.id}`,
        vars: {
          fullName: teacher.fullName?.split(' ')[0],
          period: run.period,
          classes: run.classes,
          rateCop: run.rateCop,
          amountCop: total,
          adjustmentCop: run.adjustmentCop ?? 0,
          adjustmentNote: run.adjustmentNote ?? undefined,
        },
        type: 'payment',
        title: 'Pago de nómina aprobado',
        body: `Tu pago del período ${run.period} (${run.classes} clases) fue aprobado.`,
        linkUrl: '/teacher',
      }).catch((e) => this.log.error(`payroll_paid email failed: ${(e as Error).message}`))
    }
    return { ...updated, dispersed: payout.dispersed, reference: payout.reference, error: payout.error }
  }

  /**
   * Dispersión a terceros vía Wompi. Es OPCIONAL a propósito:
   *   · `WOMPI_PAYOUTS_ENABLED=false` (default) → el pago se registra como
   *     manual y no se llama a nadie. Sirve para operar sin comisiones de
   *     dispersión, transfiriendo por fuera.
   *   · `true` → se intenta la transferencia. Si falla (red, credenciales,
   *     datos bancarios incompletos), NO se rompe la nómina: el pago queda
   *     igualmente registrado como manual con el motivo del fallo, para
   *     reintentarlo o hacerlo por fuera. Nunca se pierde el registro.
   *
   * El profesor necesita sus datos bancarios cargados; sin ellos se degrada a
   * manual con ese motivo, en vez de fallar de forma opaca.
   */
  private async dispersePayrollRun(run: {
    id: string
    teacherId: string
    amountCop: number
    period: string
  }): Promise<{ dispersed: boolean; reference?: string; error?: string }> {
    if (!env.WOMPI_PAYOUTS_ENABLED) {
      return { dispersed: false, reference: undefined }
    }
    const teacher = await this.prisma.user.findUnique({
      where: { id: run.teacherId },
      select: { fullName: true, email: true, documentNumber: true, payoutAccount: true },
    })
    const cuenta = (teacher?.payoutAccount ?? null) as {
      bankCode?: string
      accountType?: string
      accountNumber?: string
    } | null
    if (!cuenta?.accountNumber || !cuenta?.bankCode) {
      const motivo = 'el profesor no tiene datos bancarios cargados'
      this.log.warn(`[payouts] ${run.id}: ${motivo} — se registra como pago manual`)
      return { dispersed: false, error: motivo }
    }

    try {
      const referencia = `payroll-${run.period}-${run.teacherId}`.slice(0, 60)
      const apiUrl =
        env.WOMPI_ENV === 'production'
          ? 'https://production.wompi.co/v1'
          : 'https://sandbox.wompi.co/v1'
      const res = await fetch(`${apiUrl}/payouts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.WOMPI_PRIVATE_KEY}`,
        },
        body: JSON.stringify({
          amount_in_cents: run.amountCop * 100,
          currency: 'COP',
          reference: referencia,
          beneficiary: {
            full_name: teacher?.fullName,
            document_number: teacher?.documentNumber,
            email: teacher?.email,
            bank_code: cuenta.bankCode,
            account_type: cuenta.accountType ?? 'SAVINGS',
            account_number: cuenta.accountNumber,
          },
        }),
      })
      const cuerpo: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        const motivo = `Wompi respondió ${res.status}: ${JSON.stringify(cuerpo).slice(0, 300)}`
        this.log.error(`[payouts] ${run.id} falló — ${motivo}`)
        return { dispersed: false, error: motivo }
      }
      const ref = cuerpo?.data?.id ?? referencia
      this.log.log(`[payouts] ${run.id} dispersado OK ref=${ref}`)
      return { dispersed: true, reference: String(ref) }
    } catch (e) {
      const motivo = `no se pudo contactar a Wompi: ${(e as Error).message}`
      this.log.error(`[payouts] ${run.id} — ${motivo}`)
      return { dispersed: false, error: motivo }
    }
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

  /**
   * Encuestas NPS con filtros: promotores/detractores, mes (period YYYY-MM,
   * para conocer el NPS de un mes puntual) y ordenamiento.
   */
  async surveys(
    filter?: 'promoters' | 'detractors' | 'all',
    month?: string,
    orderBy?: 'recent' | 'oldest' | 'score_desc' | 'score_asc',
  ) {
    const where: Prisma.SatisfactionSurveyWhereInput = {
      ...(filter === 'promoters' ? { score: { gte: 9 } } : filter === 'detractors' ? { score: { lte: 6 } } : {}),
      ...(month ? { period: month } : {}),
    }
    const order: Prisma.SatisfactionSurveyOrderByWithRelationInput =
      orderBy === 'score_desc'
        ? { score: 'desc' }
        : orderBy === 'score_asc'
          ? { score: 'asc' }
          : orderBy === 'oldest'
            ? { createdAt: 'asc' }
            : { createdAt: 'desc' }
    const rows = await this.prisma.satisfactionSurvey.findMany({
      where,
      orderBy: order,
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
    // Meses disponibles para el dropdown del filtro.
    const periods = await this.prisma.satisfactionSurvey.groupBy({ by: ['period'], _count: true })
    return {
      rows,
      totals: { count: rows.length, promoters, detractors, nps },
      periods: periods.map((p) => p.period).sort().reverse(),
    }
  }

  /**
   * Pide la encuesta NPS YA a un estudiante: el flag hace que `pending`
   * devuelva true de inmediato y además se le envía el correo.
   */
  async requestNps(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')
    await this.prisma.user.update({ where: { id: userId }, data: { npsRequestedAt: new Date() } })
    await this.notificationsSvc.enqueue({
      userId,
      toEmail: user.email,
      template: 'nps_monthly',
      subject: '¿Cómo vamos?',
      dedupeKey: `nps-request:${userId}:${new Date().toISOString().slice(0, 10)}`,
      type: 'system',
      title: 'Cuéntanos cómo vamos',
      body: 'Tu opinión nos ayuda a mejorar tus clases.',
      linkUrl: '/app',
    })
    return { ok: true }
  }

  /**
   * Crea un usuario sin contraseña: dispara email "set-password" vía Resend.
   * El estudiante no queda activo hasta completar pago Wompi.
   */
  async createUser(input: {
    email: string
    fullName: string
    role: 'student' | 'teacher' | 'admin'
    /** Roles adicionales (p. ej. un admin que también da clases). */
    extraRoles?: AppRole[]
    level?: 'beginner' | 'intermediate' | 'advanced'
    // Empalme: estudiantes que ya pagaron por fuera de Wompi. Si viene, la
    // suscripción queda activa desde `startDate` (o ya) y vence en `endDate`.
    plan?: { planId: string; endDate: string; startDate?: string | null }
    /** Horario semanal del estudiante, con las mismas reglas del checkout. */
    schedule?: SlotRef[]
    /** Profesor a asignar de una vez (requiere `schedule`). */
    teacherId?: string
  }) {
    const email = input.email.toLowerCase()
    const exists = await this.prisma.user.findUnique({ where: { email } })
    if (exists) throw new Error('User already exists')
    const extraRoles = (input.extraRoles ?? []).filter((r) => r !== input.role)
    const user = await this.prisma.user.create({
      data: {
        email,
        fullName: input.fullName,
        role: input.role,
        extraRoles,
        englishLevel: input.level,
        passwordHash: null,
      },
    })

    let planName: string | undefined
    let planEndsAt: string | undefined
    if (input.role === 'student' && input.plan?.planId && input.plan.endDate) {
      const sub = await this.setUserSubscription(user.id, {
        planId: input.plan.planId,
        status: 'active',
        currentPeriodEnd: input.plan.endDate,
        startedAt: input.plan.startDate ?? undefined,
      })
      planName = sub.plan.name
      planEndsAt = sub.currentPeriodEnd?.toISOString()

      // Horario + profesor en el mismo paso. Se valida con las MISMAS reglas
      // que el checkout (cantidad del plan, ventana y máximo por día) para no
      // dejar entrar por el admin selecciones que la app rechazaría.
      if (input.schedule?.length) {
        await this.slotsSvc.validateSelection(input.schedule, sub.plan.daysPerWeek)
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            schedulePreferences: input.schedule as any,
            // Sin profesor queda en la cola de asignación manual del admin.
            scheduleAssignmentStatus: input.teacherId ? undefined : 'manual_pending',
          },
        })
        if (input.teacherId) {
          // Crea slots, valida cruces con la agenda del profe, notifica a ambos
          // y materializa las clases. Si el profe está ocupado, lanza y el
          // usuario queda creado sin asignar (el admin reintenta desde la ficha).
          await this.schedulingSvc.assignRequest(user.id, input.teacherId)
        }
      }
    }

    // Invitación: link para configurar contraseña (reusa el flujo de reset,
    // TTL 7 días). Sin `plan`, un estudiante NO queda activo hasta pagar Wompi.
    const token = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    await this.prisma.passwordReset.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) },
    })
    const link = `${env.PUBLIC_SITE_URL}/reset-password?token=${token}`
    await this.notificationsSvc.enqueue({
      userId: user.id,
      toEmail: user.email,
      template: 'account_invite',
      subject: `Tu invitación a ${env.BRAND_NAME} 💛`,
      dedupeKey: `invite:${user.id}:${token.slice(0, 12)}`,
      vars: {
        fullName: user.fullName,
        link,
        role: input.role,
        ...(planName ? { planName } : {}),
        ...(planEndsAt ? { planEndsAt } : {}),
      },
      type: 'system',
    })
    // En dev devolvemos el link para poder probar sin SMTP.
    return { user, link }
  }

  /**
   * Crea/edita la suscripción de un estudiante a mano (empalmes, cortesías,
   * extensiones). `currentPeriodEnd` acepta 'YYYY-MM-DD' (se normaliza a fin
   * de día, hora Colombia) o ISO completo; `null` la deja sin vencimiento.
   */
  async setUserSubscription(
    id: string,
    input: {
      planId: string
      status?: 'pending' | 'active' | 'past_due' | 'canceled' | 'expired'
      currentPeriodEnd?: string | null
      startedAt?: string | null
    },
  ) {
    const userId = await this.resolveExistingUserId(id)
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } })
    if (user.role !== 'student') throw new Error('Sólo los estudiantes tienen suscripción')
    const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } })
    if (!plan) throw new NotFoundException('Plan not found')

    const parseDate = (v: string | null | undefined): Date | null | undefined => {
      if (v === undefined) return undefined
      if (v === null || v === '') return null
      // Fecha sin hora → fin del día en Colombia (UTC-5): el plan cubre ese día completo.
      const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T23:59:59-05:00`) : new Date(v)
      if (Number.isNaN(d.getTime())) throw new Error(`Fecha inválida: ${v}`)
      return d
    }

    const status = input.status ?? 'active'
    const currentPeriodEnd = parseDate(input.currentPeriodEnd)
    const startedAt = parseDate(input.startedAt)

    const existing = await this.prisma.subscription.findUnique({ where: { userId } })
    const sub = await this.prisma.subscription.upsert({
      where: { userId },
      update: {
        planId: plan.id,
        status,
        ...(currentPeriodEnd !== undefined ? { currentPeriodEnd } : {}),
        ...(startedAt !== undefined ? { startedAt } : {}),
        ...(status === 'active' ? { canceledAt: null, cancelAt: null } : {}),
      },
      create: {
        userId,
        planId: plan.id,
        status,
        startedAt: startedAt ?? new Date(),
        currentPeriodEnd: currentPeriodEnd ?? null,
      },
      include: { plan: true },
    })
    this.log.log(
      `Suscripción ${existing ? 'actualizada' : 'creada'} manualmente: user=${user.email} plan=${plan.id} status=${status} hasta=${sub.currentPeriodEnd?.toISOString() ?? '—'}`,
    )
    return sub
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
      if (!t || !hasRole(t, 'teacher')) throw new Error('Invalid teacher')
    }

    // Migración completa (slots, clases, aula) con validación de cruces.
    await this.schedulingSvc.adminReassignTeacher(resolvedStudentId, resolvedTeacherId)
    return this.prisma.user.findUnique({ where: { id: resolvedStudentId } })
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

    const isTeacher = hasRole(user, 'teacher')
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
              // Notas de clase (classId) Y notas a nivel estudiante (studentId
              // sin clase) — antes solo se traían las de clase y el admin no
              // veía las notas generales del profe.
              where: { OR: [{ studentId: resolvedId }, { class: { studentId: resolvedId } }] },
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

    // Totales de clases por estado (todas, no solo las 50 listadas):
    // estudiante → las suyas; profesor → todas las de sus estudiantes.
    const totalsWhere = isStudent
      ? { studentId: resolvedId }
      : isTeacher
        ? { teacherId: resolvedId }
        : null
    const classTotals: Record<string, number> = {}
    if (totalsWhere) {
      const grouped = await this.prisma.class.groupBy({ by: ['status'], where: totalsWhere, _count: true })
      for (const g of grouped) classTotals[g.status] = g._count
    }

    return {
      user,
      payments,
      classes: isStudent ? classesAsStudent : classesAsTeacher,
      classTotals,
      surveys, // sólo admin las verá — el guard ya bloquea profesores
      progress,
      notes: isStudent ? notesAboutStudent : notesByTeacher,
      assignedStudents,
    }
  }

  async updateUser(
    id: string,
    data: {
      fullName?: string
      phone?: string
      role?: 'student' | 'teacher' | 'admin'
      /** Roles adicionales: así un admin puede además dar clases. */
      extraRoles?: AppRole[]
      englishLevel?: 'beginner' | 'intermediate' | 'advanced' | null
    },
  ) {
    const resolvedId = await this.resolveExistingUserId(id)
    const patch: Prisma.UserUpdateInput = { ...(data as any) }
    if (data.extraRoles) {
      const current = await this.prisma.user.findUniqueOrThrow({
        where: { id: resolvedId },
        select: { role: true },
      })
      // El rol principal no se repite en los extras: `rolesOf()` lo suma solo.
      const role = data.role ?? current.role
      patch.extraRoles = { set: [...new Set(data.extraRoles)].filter((r) => r !== role) }
    }
    return this.prisma.user.update({ where: { id: resolvedId }, data: patch })
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
    const user = await this.prisma.user.findUnique({ where: { id: resolvedId } })
    const token = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24)
    await this.prisma.passwordReset.create({ data: { userId: resolvedId, tokenHash, expiresAt } })
    const link = `${env.PUBLIC_SITE_URL}/reset-password?token=${token}`
    if (user) {
      await this.notificationsSvc.enqueue({
        userId: user.id,
        toEmail: user.email,
        template: 'password_reset',
        subject: 'Restablece tu contraseña',
        dedupeKey: `pwreset:${user.id}:${token.slice(0, 12)}`,
        vars: { link },
        type: 'system',
      })
    }
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
      // Compuerta: bloquea todo lo que va después hasta completarla.
      isCheckpoint: input.isCheckpoint ?? existing?.isCheckpoint ?? false,
      ...(input.position != null ? { position: Number(input.position) } : {}),
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

  /**
   * Reordena las lecciones de un módulo según el orden recibido. Sirve para
   * mover un checkpoint entre lecciones (p. ej. dejarlo tras la 2ª).
   */
  async reorderLessons(moduleId: string, lessonIds: string[]) {
    const lessons = await this.prisma.lesson.findMany({
      where: { moduleId },
      select: { id: true },
    })
    const validos = new Set(lessons.map((l) => l.id))
    const orden = lessonIds.filter((id) => validos.has(id))
    if (orden.length !== lessons.length) {
      throw new BadRequestException('La lista debe incluir todas las lecciones del módulo')
    }
    await this.prisma.$transaction(
      orden.map((id, i) =>
        this.prisma.lesson.update({ where: { id }, data: { position: i + 1 } }),
      ),
    )
    return { ok: true, orden }
  }

  async deleteLesson(id: string) {
    await this.prisma.lesson.delete({ where: { id } })
    return { ok: true }
  }

  // ─── CMS · checkpoints (exámenes) ─────────────────────────────────────
  async saveCheckpoint(input: {
    id?: string
    moduleId?: string
    fromLevel?: 'beginner' | 'intermediate' | 'advanced'
    toLevel?: 'beginner' | 'intermediate' | 'advanced'
    passingScore?: number
    questions?: unknown
    settings?: unknown
  }) {
    const id = input.id ?? randomUUID()
    const existing = await this.prisma.checkpoint.findUnique({ where: { id } })
    const moduleId = input.moduleId ?? existing?.moduleId
    if (!moduleId) throw new Error('moduleId required')
    // Validación por tipo de pregunta (checkpoints v2).
    if (Array.isArray(input.questions)) {
      for (let i = 0; i < input.questions.length; i++) {
        const err = validateQuestion(input.questions[i], i)
        if (err) throw new BadRequestException(err)
      }
    }
    const data = {
      moduleId,
      fromLevel: (input.fromLevel ?? existing?.fromLevel) as any,
      toLevel: (input.toLevel ?? existing?.toLevel) as any,
      passingScore: input.passingScore ?? existing?.passingScore ?? 70,
      questions: (input.questions ?? existing?.questions ?? []) as any,
      settings: (input.settings ?? (existing as any)?.settings ?? {}) as any,
    }
    if (existing) return this.prisma.checkpoint.update({ where: { id }, data })
    return this.prisma.checkpoint.create({ data: { id, ...data } })
  }

  async deleteCheckpoint(id: string) {
    await this.prisma.checkpoint.delete({ where: { id } })
    return { ok: true }
  }

  // ─── CRM · estudiantes en riesgo ──────────────────────────────────────
  /**
   * Segmenta estudiantes con señales de riesgo de churn para seguimiento del
   * equipo: suscripción con problemas, sin clases recientes, o aprendizaje
   * inactivo. Devuelve razones + score (nº de señales) ordenado desc.
   */
  async atRiskStudents() {
    const DAY = 86400000
    const now = Date.now()
    const NO_CLASS_DAYS = 14
    const NO_LEARN_DAYS = 21

    const [students, subs, classes, progress] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'student', deletedAt: null },
        select: { id: true, fullName: true, email: true, assignedTeacherId: true, createdAt: true },
      }),
      this.prisma.subscription.findMany({
        select: { userId: true, status: true, currentPeriodEnd: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.class.findMany({
        where: { status: 'validated' },
        select: { studentId: true, validatedAt: true, startsAt: true },
        orderBy: { startsAt: 'desc' },
      }),
      this.prisma.lessonProgress.findMany({
        where: { completedAt: { not: null } },
        select: { userId: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
    ])

    const latestSub = new Map<string, { status: string; currentPeriodEnd: Date | null }>()
    for (const s2 of subs) if (!latestSub.has(s2.userId)) latestSub.set(s2.userId, s2)
    const lastClass = new Map<string, Date>()
    for (const c of classes) {
      const d = c.validatedAt ?? c.startsAt
      if (d && !lastClass.has(c.studentId)) lastClass.set(c.studentId, d)
    }
    const lastLearn = new Map<string, Date>()
    for (const pr of progress) if (!lastLearn.has(pr.userId)) lastLearn.set(pr.userId, pr.updatedAt)

    const rows = students.map((st) => {
      const reasons: string[] = []
      const sub = latestSub.get(st.id)
      if (!sub) reasons.push('Sin suscripción')
      else if (['past_due', 'canceled', 'expired'].includes(sub.status)) reasons.push(`Suscripción ${sub.status}`)

      const lc = lastClass.get(st.id)
      const daysSinceClass = lc ? Math.floor((now - lc.getTime()) / DAY) : null
      const daysSinceSignup = Math.floor((now - st.createdAt.getTime()) / DAY)
      if (!lc && daysSinceSignup > 7) reasons.push('Nunca ha tomado clase')
      else if (daysSinceClass !== null && daysSinceClass >= NO_CLASS_DAYS) reasons.push(`Sin clases hace ${daysSinceClass}d`)

      const ll = lastLearn.get(st.id)
      const daysSinceLearn = ll ? Math.floor((now - ll.getTime()) / DAY) : null
      if (daysSinceLearn === null && daysSinceSignup > 7) reasons.push('Sin avance de aprendizaje')
      else if (daysSinceLearn !== null && daysSinceLearn >= NO_LEARN_DAYS) reasons.push('Aprendizaje inactivo')

      return {
        id: st.id,
        fullName: st.fullName,
        email: st.email,
        assignedTeacherId: st.assignedTeacherId,
        subscriptionStatus: sub?.status ?? null,
        lastClassAt: lc ?? null,
        daysSinceClass,
        reasons,
        risk: reasons.length,
      }
    })

    return rows.filter((r) => r.risk > 0).sort((a, b) => b.risk - a.risk)
  }

  // ─── Planes (precios configurables) ──────────────────────────────────
  listPlans() {
    return this.prisma.plan.findMany({ orderBy: { daysPerWeek: 'asc' } })
  }

  // ─── Ajustes de contacto (WhatsApp) ──────────────────────────────────
  async contactSettings() {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { in: ['contact.whatsappNumber', 'contact.whatsappMessage'] } },
    })
    const map = new Map(rows.map((r) => [r.key, r.value as any]))
    const read = (k: string, d: string) => {
      const v = map.get(k)
      if (v && typeof v === 'object' && 'value' in v) return String((v as any).value)
      return v == null ? d : String(v)
    }
    return {
      whatsappNumber: read('contact.whatsappNumber', '573000000000'),
      whatsappMessage: read('contact.whatsappMessage', 'Hola, quiero más información de FreaknEnglish'),
    }
  }

  async updateContactSettings(body: { whatsappNumber?: string; whatsappMessage?: string }) {
    const set = (key: string, value: string) =>
      this.prisma.appSetting.upsert({ where: { key }, update: { value: value as any }, create: { key, value: value as any } })
    if (body.whatsappNumber !== undefined) await set('contact.whatsappNumber', String(body.whatsappNumber).replace(/[^0-9]/g, ''))
    if (body.whatsappMessage !== undefined) await set('contact.whatsappMessage', String(body.whatsappMessage))
    return this.contactSettings()
  }

  // ─── Contenido del sitio público (home) ──────────────────────────────
  /**
   * Contenido editable de la home: media (imágenes/videos por slot, URLs de
   * MinIO), FAQs, documentos legales y redes sociales. El storefront tiene
   * defaults quemados y hace merge con esto — si la API se cae, la home
   * sigue funcionando con los defaults/último cache.
   */
  /** URL actual del objeto de un slot de media, o null si no se configuró. */
  async siteMediaUrl(slot: string): Promise<string | null> {
    const { media } = await this.siteContent()
    const url = (media as Record<string, unknown>)[slot]
    return typeof url === 'string' && url.trim() ? url : null
  }

  async siteContent() {
    const row = await this.prisma.appSetting
      .findUnique({ where: { key: 'site.content' } })
      .catch(() => null)
    const v = (row?.value as any) ?? {}
    return {
      media: v.media && typeof v.media === 'object' ? v.media : {},
      faqs: Array.isArray(v.faqs) ? v.faqs : null,
      legal: v.legal && typeof v.legal === 'object' ? v.legal : {},
      social: v.social && typeof v.social === 'object' ? v.social : {},
    }
  }

  async updateSiteContent(patch: {
    media?: Record<string, string | null>
    faqs?: Array<{ q: string; a: string }> | null
    legal?: Record<string, string | null>
    social?: Record<string, string | null>
  }) {
    const current = await this.siteContent()
    const mergeMap = (base: Record<string, string>, p?: Record<string, string | null>) => {
      const out: Record<string, string> = { ...base }
      for (const [k, val] of Object.entries(p ?? {})) {
        if (val === null || val === '') delete out[k]
        else out[k] = String(val)
      }
      return out
    }
    const next = {
      media: mergeMap(current.media, patch.media),
      faqs: patch.faqs !== undefined ? patch.faqs : current.faqs,
      legal: mergeMap(current.legal, patch.legal),
      social: mergeMap(current.social, patch.social),
    }
    await this.prisma.appSetting.upsert({
      where: { key: 'site.content' },
      update: { value: next as any },
      create: { key: 'site.content', value: next as any },
    })
    return next
  }

  async updatePlan(
    id: string,
    body: { name?: string; daysPerWeek?: number; priceUsd?: number; priceCop?: number; isActive?: boolean; features?: unknown },
  ) {
    const data: any = {}
    for (const k of ['name', 'daysPerWeek', 'priceUsd', 'priceCop', 'isActive'] as const) {
      if (body[k] !== undefined) data[k] = body[k]
    }
    if (body.features !== undefined) data.features = body.features as any
    return this.prisma.plan.update({ where: { id }, data })
  }

  signUpload(body: { filename: string; contentType?: string; lessonId?: string; siteSlot?: string }) {
    // `siteSlot`: asset del sitio con clave estable (site/<slot>) — re-subir
    // reemplaza el objeto y la URL pública no cambia.
    if (body.siteSlot) {
      const slot = body.siteSlot.toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
      return this.storage.signUpload({
        filename: body.filename,
        contentType: body.contentType,
        fixedKey: `site/${slot}`,
      })
    }
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

  // ─── Cleanup / reset de datos de prueba (solo admin) ────────────────

  /** Conteos actuales para que el admin vea qué borraría. */
  async cleanupPreview() {
    const [students, teachers, subscriptions, classes, payments, notifications, boards, surveys, payrollRuns, slots] =
      await Promise.all([
        this.prisma.user.count({ where: { role: 'student' } }),
        this.prisma.user.count({ where: IS_TEACHER }),
        this.prisma.subscription.count(),
        this.prisma.class.count(),
        this.prisma.paymentIntent.count(),
        this.prisma.notification.count(),
        this.prisma.board.count(),
        this.prisma.satisfactionSurvey.count(),
        this.prisma.payrollRun.count(),
        this.prisma.scheduleSlot.count(),
      ])
    return { students, teachers, subscriptions, classes, payments, notifications, boards, surveys, payrollRuns, slots }
  }

  /**
   * Reset selectivo para pruebas en prod. `targets` define qué borrar.
   * Reglas duras: jamás borra usuarios admin (ni el que ejecuta), y borra
   * en orden de dependencias (FKs sin cascade: impersonation_logs).
   */
  async cleanup(adminId: string, targets: string[]) {
    const valid = new Set([
      'students', 'teachers', 'subscriptions', 'schedule', 'classes',
      'payments', 'notifications', 'boards', 'surveys', 'payroll',
    ])
    const chosen = (targets ?? []).filter((t) => valid.has(t))
    if (chosen.length === 0) throw new BadRequestException('Nada para borrar: targets vacío o inválido')
    this.log.warn(`[cleanup] admin=${adminId} targets=${chosen.join(',')}`)

    const deleted: Record<string, number> = {}

    const wipeUsers = async (role: 'student' | 'teacher') => {
      const users = await this.prisma.user.findMany({
        where: { role, id: { not: adminId } },
        select: { id: true },
      })
      const ids = users.map((u) => u.id)
      if (ids.length === 0) return 0
      // FKs sin cascade primero.
      await this.prisma.impersonationLog.deleteMany({
        where: { OR: [{ adminId: { in: ids } }, { targetId: { in: ids } }] },
      })
      // PaymentIntents quedan con userId=null (SetNull) — histórico contable.
      const r = await this.prisma.user.deleteMany({ where: { id: { in: ids } } })
      return r.count
    }

    // Orden: dependientes → usuarios.
    if (chosen.includes('notifications')) {
      deleted.notifications = (await this.prisma.notification.deleteMany()).count
    }
    if (chosen.includes('surveys')) {
      deleted.surveys = (await this.prisma.satisfactionSurvey.deleteMany()).count
    }
    if (chosen.includes('boards')) {
      deleted.boards = (await this.prisma.board.deleteMany()).count
    }
    if (chosen.includes('payroll')) {
      deleted.payrollRuns = (await this.prisma.payrollRun.deleteMany()).count
    }
    if (chosen.includes('classes')) {
      await this.prisma.classNote.deleteMany()
      deleted.classes = (await this.prisma.class.deleteMany()).count
    }
    if (chosen.includes('schedule')) {
      deleted.scheduleSlots = (await this.prisma.scheduleSlot.deleteMany()).count
      await this.prisma.user.updateMany({
        where: { role: 'student' },
        data: { schedulePreferences: Prisma.DbNull, scheduleAssignmentStatus: null, assignedTeacherId: null },
      })
    }
    if (chosen.includes('payments')) {
      await this.prisma.paymentEvent.deleteMany()
      deleted.payments = (await this.prisma.paymentIntent.deleteMany()).count
    }
    if (chosen.includes('subscriptions')) {
      deleted.subscriptions = (await this.prisma.subscription.deleteMany()).count
    }
    if (chosen.includes('students')) {
      deleted.students = await wipeUsers('student')
    }
    if (chosen.includes('teachers')) {
      deleted.teachers = await wipeUsers('teacher')
    }

    this.log.warn(`[cleanup] resultado: ${JSON.stringify(deleted)}`)
    return { ok: true, deleted }
  }

  // ─── Carritos abandonados / remarketing ─────────────────────────────

  /**
   * Dos poblaciones de venta perdida:
   *  1. `carts`: paymentIntents PENDING (checkout iniciado, pago sin aprobar)
   *     de emails que nunca han pagado.
   *  2. `registered`: usuarios student registrados sin suscripción y sin
   *     ningún pago aprobado (se registró y nunca compró).
   * Cada fila incluye si ya se le envió recordatorio (automático o manual).
   */
  async abandonedCarts() {
    const approvedEmails = new Set(
      (
        await this.prisma.paymentIntent.findMany({
          where: { status: 'APPROVED' },
          select: { customerEmail: true },
        })
      ).map((i) => i.customerEmail.toLowerCase()),
    )

    const intents = await this.prisma.paymentIntent.findMany({
      where: { status: 'PENDING', customerEmail: { not: '' } },
      include: { plan: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    })
    // Un carrito por email (el más reciente), excluyendo quien ya pagó.
    const seen = new Set<string>()
    const carts: any[] = []
    for (const i of intents) {
      const email = i.customerEmail.toLowerCase()
      if (approvedEmails.has(email) || seen.has(email)) continue
      seen.add(email)
      carts.push(i)
    }

    const registered = await this.prisma.user.findMany({
      where: {
        role: 'student',
        deletedAt: null,
        disabledAt: null,
        subscription: null,
        paymentIntents: { none: { status: 'APPROVED' } },
      },
      select: { id: true, email: true, fullName: true, phone: true, createdAt: true, lastLoginAt: true },
      orderBy: { createdAt: 'desc' },
      take: 300,
    })
    // Si además dejó un checkout PENDING ya está en `carts`; no duplicar.
    const registeredFiltered = registered.filter((u) => !seen.has(u.email.toLowerCase()))

    // Estado de recordatorios enviados (automático `cart:<id>` o manual).
    const reminders = await this.prisma.notification.findMany({
      where: { template: { in: ['abandoned_cart', 'signup_nudge'] } },
      select: { toEmail: true, status: true, sentAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    const lastReminder = new Map<string, { status: string; at: Date }>()
    for (const r of reminders) {
      const k = r.toEmail.toLowerCase()
      if (!lastReminder.has(k)) lastReminder.set(k, { status: r.status, at: r.sentAt ?? r.createdAt })
    }

    return {
      carts: carts.map((c) => ({
        intentId: c.id,
        email: c.customerEmail,
        fullName: c.customerName,
        phone: c.customerPhone,
        planName: c.plan?.name ?? c.planId,
        amountInCents: c.amountInCents,
        currency: c.currency,
        createdAt: c.createdAt,
        userId: c.userId,
        reminder: lastReminder.get(c.customerEmail.toLowerCase()) ?? null,
      })),
      registered: registeredFiltered.map((u) => ({
        userId: u.id,
        email: u.email,
        fullName: u.fullName,
        phone: u.phone,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        reminder: lastReminder.get(u.email.toLowerCase()) ?? null,
      })),
    }
  }

  /** Envía (o reenvía) el recordatorio manualmente desde el admin. */
  async sendCartReminder(body: { intentId?: string; userId?: string }) {
    const stamp = new Date().toISOString().slice(0, 10)
    if (body.intentId) {
      const intent = await this.prisma.paymentIntent.findUnique({
        where: { id: body.intentId },
        include: { plan: { select: { name: true } } },
      })
      if (!intent) throw new NotFoundException('Intent no encontrado')
      return this.notificationsSvc.enqueue({
        userId: intent.userId ?? undefined,
        toEmail: intent.customerEmail,
        template: 'abandoned_cart',
        subject: 'Tu cupo sigue disponible 💛',
        dedupeKey: `cart:manual:${intent.id}:${stamp}`,
        vars: { planName: intent.plan?.name ?? 'tu plan', fullName: intent.customerName?.split(' ')[0] },
      })
    }
    if (body.userId) {
      const user = await this.prisma.user.findUnique({ where: { id: body.userId } })
      if (!user) throw new NotFoundException('Usuario no encontrado')
      return this.notificationsSvc.enqueue({
        userId: user.id,
        toEmail: user.email,
        template: 'signup_nudge',
        subject: 'Tu inglés te está esperando 💛',
        dedupeKey: `nudge:manual:${user.id}:${stamp}`,
        vars: { fullName: user.fullName?.split(' ')[0] },
      })
    }
    throw new BadRequestException('intentId o userId requerido')
  }
}
