import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { env } from '../../config/env'
import { SchedulingService } from '../scheduling/scheduling.service'
import { SlotsService } from '../scheduling/slots.service'

/**
 * Runs the actual automation logic. Triggered by the repeating jobs in
 * AutomationsService. All notification enqueues are dedupe-keyed so reruns
 * are idempotent.
 */
@Processor('automations')
export class AutomationsProcessor extends WorkerHost {
  private readonly log = new Logger(AutomationsProcessor.name)
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private scheduling: SchedulingService,
    private slots: SlotsService,
  ) {
    super()
  }

  async process(job: Job) {
    if (job.name === 'tick-5m') await this.tick5m()
    if (job.name === 'tick-daily') await this.tickDaily()
  }

  private async tick5m() {
    const now = new Date()

    // Auto-tomada (decisión Q2: inmediata al terminar; profe corrige 48 h).
    const auto = await this.prisma.class.updateMany({
      where: { status: 'scheduled', endsAt: { lt: now } },
      data: { status: 'validated', autoValidated: true, validatedAt: now },
    })
    if (auto.count > 0) this.log.log(`Auto-validated ${auto.count} class(es)`)

    // Libera reservas de pago (pending) vencidas.
    await this.slots.cleanupExpiredPending()
    const in24 = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const in1 = new Date(now.getTime() + 60 * 60 * 1000)

    // 24h reminders
    const cls24 = await this.prisma.class.findMany({
      where: {
        status: 'scheduled',
        startsAt: { gte: new Date(in24.getTime() - 5 * 60 * 1000), lte: in24 },
      },
      include: { student: true },
    })
    for (const c of cls24) {
      await this.notifications.enqueue({
        userId: c.studentId,
        toEmail: c.student.email,
        template: 'reminder_24h',
        subject: 'Tu clase es mañana',
        dedupeKey: `reminder24:${c.id}`,
        vars: { startsAt: c.startsAt.toISOString() },
      })
    }

    // 1h reminders
    const cls1 = await this.prisma.class.findMany({
      where: {
        status: 'scheduled',
        startsAt: { gte: new Date(in1.getTime() - 5 * 60 * 1000), lte: in1 },
      },
      include: { student: true },
    })
    for (const c of cls1) {
      await this.notifications.enqueue({
        userId: c.studentId,
        toEmail: c.student.email,
        template: 'reminder_1h',
        subject: 'Tu clase empieza en 1 hora',
        dedupeKey: `reminder1:${c.id}`,
        vars: {},
      })
    }

    // Carrito abandonado: 4 h después de dejar el correo sin completar el pago.
    // Solo si el comprador NO tiene ningún pago aprobado posterior (remarketing).
    const cutoff = new Date(now.getTime() - 4 * 60 * 60 * 1000)
    const carts = await this.prisma.paymentIntent.findMany({
      where: { status: 'PENDING', createdAt: { lt: cutoff }, customerEmail: { not: '' } },
      include: { plan: true },
      take: 200,
    })
    for (const c of carts) {
      const paid = await this.prisma.paymentIntent.findFirst({
        where: { customerEmail: { equals: c.customerEmail, mode: 'insensitive' }, status: 'APPROVED' },
        select: { id: true },
      })
      if (paid) continue
      await this.notifications.enqueue({
        userId: c.userId ?? undefined,
        toEmail: c.customerEmail,
        template: 'abandoned_cart',
        subject: 'Tu cupo sigue disponible 💛',
        dedupeKey: `cart:${c.id}`,
        vars: { planName: c.plan.name, fullName: c.customerName?.split(' ')[0] },
      })
    }
  }

  private async tickDaily() {
    const now = new Date()

    // Expira automáticamente las suscripciones cuyo período ya venció
    // (billing recurrente no implementado): status active -> expired.
    const toExpire = await this.prisma.subscription.findMany({
      where: { status: 'active' as any, currentPeriodEnd: { lt: now } },
      include: { user: { select: { id: true, email: true, fullName: true } } },
    })
    if (toExpire.length > 0) {
      await this.prisma.subscription.updateMany({
        where: { id: { in: toExpire.map((s) => s.id) } },
        data: { status: 'expired' as any },
      })
      this.log.log(`Expired ${toExpire.length} subscriptions`)
      // Remarketing: acceso pausado, cupo reservado 5 días hábiles.
      for (const sub of toExpire) {
        await this.notifications.enqueue({
          userId: sub.user.id,
          toEmail: sub.user.email,
          template: 'subscription_expired',
          subject: 'Tus clases quedaron en pausa — tu cupo sigue reservado',
          dedupeKey: `sub-expired:${sub.id}:${sub.currentPeriodEnd?.toISOString().slice(0, 10)}`,
          vars: { fullName: sub.user.fullName?.split(' ')[0] },
          type: 'payment',
          title: 'Tu suscripción venció',
          body: 'Tu horario queda reservado 5 días hábiles. Reactiva tu plan para seguir.',
          linkUrl: '/checkout',
        })
      }
    }

    // SDD-scheduling-v2: holds de 5 días hábiles y liberación automática.
    await this.slots.holdSlotsForExpired()
    const releasedIds = await this.slots.releaseExpiredHolds()
    for (const sid of releasedIds) {
      const u = await this.prisma.user.findUnique({ where: { id: sid }, select: { email: true, fullName: true } })
      if (!u) continue
      await this.notifications.enqueue({
        userId: sid,
        toEmail: u.email,
        template: 'slot_released',
        subject: 'Liberamos tu horario — tu progreso sigue aquí',
        dedupeKey: `slot-released:${sid}:${now.toISOString().slice(0, 10)}`,
        vars: { fullName: u.fullName?.split(' ')[0] },
        type: 'payment',
        title: 'Tu horario se liberó',
        body: 'Elige un nuevo horario para volver a clases.',
        linkUrl: '/checkout',
      })
    }
    // Migración perezosa de horarios legacy a ScheduleSlots (idempotente).
    await this.slots.backfillFromPreferences()
    // Mantiene el horizonte de clases generado para estudiantes activos.
    const activeStudents = await this.prisma.user.findMany({
      where: {
        role: 'student',
        deletedAt: null,
        assignedTeacherId: { not: null },
        subscription: { status: 'active' },
      },
      select: { id: true },
    })
    for (const st of activeStudents) {
      await this.scheduling.ensureUpcomingClasses(st.id).catch(() => null)
    }

    // Recordatorio de pago: 5 días antes del vencimiento (ventana de renovación).
    const in5d = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)
    const subs = await this.prisma.subscription.findMany({
      where: {
        status: 'active',
        currentPeriodEnd: { gte: new Date(in5d.getTime() - 24 * 60 * 60 * 1000), lte: in5d },
      },
      include: { user: true, plan: true },
    })
    for (const s of subs) {
      await this.notifications.enqueue({
        userId: s.userId,
        toEmail: s.user.email,
        template: 'renewal_reminder',
        subject: 'Tu plan vence en 5 días — renueva sin perder tu horario',
        dedupeKey: `renewal:${s.id}:${s.currentPeriodEnd?.toISOString().slice(0, 10)}`,
        vars: {
          fullName: s.user.fullName?.split(' ')[0],
          planName: s.plan?.name,
          endDate: s.currentPeriodEnd?.toLocaleDateString('es-CO', { day: '2-digit', month: 'long' }) ?? '',
        },
        type: 'payment',
        title: 'Tu plan vence en 5 días',
        body: 'Renueva ahora y tu nuevo mes se suma al actual.',
        linkUrl: '/checkout',
      })
    }

    // NPS monthly: first day of month
    if (now.getDate() === 1) {
      const users = await this.prisma.user.findMany({ where: { role: 'student' } })
      const period = now.toISOString().slice(0, 7)
      for (const u of users) {
        await this.notifications.enqueue({
          userId: u.id,
          toEmail: u.email,
          template: 'nps_monthly',
          subject: '¿Cómo vamos?',
          dedupeKey: `nps:${u.id}:${period}`,
        })
      }

      // Nómina del mes anterior: persiste PayrollRun (status pending) para que
      // el admin revise y apruebe/pague. No dispersa automáticamente.
      await this.generatePayrollForPreviousMonth()
    }
  }

  /** Tarifa por hora (app_settings.payroll.hourlyRateCop → fallback env). */
  private async hourlyRateCop(): Promise<number> {
    const row = await this.prisma.appSetting
      .findUnique({ where: { key: 'payroll.hourlyRateCop' } })
      .catch(() => null)
    const raw = row?.value as any
    const val = typeof raw === 'number' ? raw : Number(raw?.value ?? raw ?? NaN)
    return Number.isFinite(val) && val > 0 ? val : env.TEACHER_PAYRATE_COP
  }

  /**
   * Genera/actualiza las corridas de nómina del mes anterior sumando las horas
   * reales de las clases con status='validated' (validación cruzada). Respeta
   * las corridas ya pagadas.
   */
  private async generatePayrollForPreviousMonth() {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 1)
    const period = start.toISOString().slice(0, 7)
    const classes = await this.prisma.class.findMany({
      where: { status: 'validated', validatedAt: { gte: start, lt: end }, teacherId: { not: null } },
      select: { teacherId: true, startsAt: true, endsAt: true },
    })
    const minutes = new Map<string, number>()
    const counts = new Map<string, number>()
    for (const c of classes) {
      const tid = c.teacherId!
      const dur = Math.max(0, Math.round((c.endsAt.getTime() - c.startsAt.getTime()) / 60000)) || 60
      minutes.set(tid, (minutes.get(tid) ?? 0) + dur)
      counts.set(tid, (counts.get(tid) ?? 0) + 1)
    }
    const rate = await this.hourlyRateCop()
    for (const [teacherId, mins] of minutes) {
      const amountCop = Math.round((mins / 60) * rate)
      const existing = await this.prisma.payrollRun.findUnique({
        where: { period_teacherId: { period, teacherId } },
      })
      if (existing?.status === 'paid') continue
      await this.prisma.payrollRun.upsert({
        where: { period_teacherId: { period, teacherId } },
        update: { classes: counts.get(teacherId) ?? 0, rateCop: rate, amountCop },
        create: { period, teacherId, classes: counts.get(teacherId) ?? 0, rateCop: rate, amountCop, status: 'pending' },
      })
    }
    this.log.log(`Payroll runs generated for ${period}: ${minutes.size} teachers`)
  }
}
