import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { env } from '../../config/env'
import { JwtService } from '@nestjs/jwt'
import { randomBytes } from 'crypto'

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('automations') private automationsQueue: Queue,
    private jwt: JwtService,
  ) {}

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

  async payroll(period: string) {
    const [year, month] = period.split('-').map(Number)
    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 1)
    const classes = await this.prisma.class.findMany({
      where: { status: 'validated', validatedAt: { gte: start, lt: end }, teacherId: { not: null } },
      select: { teacherId: true },
    })
    const counts = new Map<string, number>()
    for (const c of classes) counts.set(c.teacherId!, (counts.get(c.teacherId!) ?? 0) + 1)
    const teacherIds = Array.from(counts.keys())
    const teachers = await this.prisma.user.findMany({ where: { id: { in: teacherIds } } })
    return teachers.map((t) => ({
      teacherId: t.id,
      fullName: t.fullName,
      classes: counts.get(t.id) ?? 0,
      rateCop: env.TEACHER_PAYRATE_COP,
      amountCop: (counts.get(t.id) ?? 0) * env.TEACHER_PAYRATE_COP,
    }))
  }

  async payrollCsv(period: string) {
    const rows = await this.payroll(period)
    const header = 'teacher_id,full_name,classes,rate_cop,amount_cop'
    const body = rows
      .map((r) => [r.teacherId, JSON.stringify(r.fullName), r.classes, r.rateCop, r.amountCop].join(','))
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
}
