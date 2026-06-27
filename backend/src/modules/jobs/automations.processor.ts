import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'

/**
 * Runs the actual automation logic. Triggered by the repeating jobs in
 * AutomationsService. All notification enqueues are dedupe-keyed so reruns
 * are idempotent.
 */
@Processor('automations')
export class AutomationsProcessor extends WorkerHost {
  private readonly log = new Logger(AutomationsProcessor.name)
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {
    super()
  }

  async process(job: Job) {
    if (job.name === 'tick-5m') await this.tick5m()
    if (job.name === 'tick-daily') await this.tickDaily()
  }

  private async tick5m() {
    const now = new Date()
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

    // Abandoned cart (>30m PENDING)
    const cutoff = new Date(now.getTime() - 30 * 60 * 1000)
    const carts = await this.prisma.paymentIntent.findMany({
      where: { status: 'PENDING', createdAt: { lt: cutoff } },
      include: { plan: true },
    })
    for (const c of carts) {
      await this.notifications.enqueue({
        userId: c.userId ?? undefined,
        toEmail: c.customerEmail,
        template: 'abandoned_cart',
        subject: 'Tu plan te está esperando',
        dedupeKey: `cart:${c.id}`,
        vars: { planName: c.plan.name },
      })
    }
  }

  private async tickDaily() {
    const now = new Date()
    const in3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    const subs = await this.prisma.subscription.findMany({
      where: {
        status: 'active',
        currentPeriodEnd: { gte: new Date(in3d.getTime() - 12 * 60 * 60 * 1000), lte: in3d },
      },
      include: { user: true },
    })
    for (const s of subs) {
      await this.notifications.enqueue({
        userId: s.userId,
        toEmail: s.user.email,
        template: 'renewal_3d',
        subject: 'Tu plan se renueva en 3 días',
        dedupeKey: `renewal:${s.id}:${s.currentPeriodEnd?.toISOString().slice(0, 10)}`,
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
    }
  }
}
