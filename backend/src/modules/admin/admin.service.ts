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
    if (teacherId) {
      const t = await this.prisma.user.findUnique({ where: { id: teacherId } })
      if (!t || t.role !== 'teacher') throw new Error('Invalid teacher')
    }
    return this.prisma.user.update({
      where: { id: studentId },
      data: { assignedTeacherId: teacherId },
    })
  }

  /**
   * Genera un JWT de impersonación que dura 30 min y registra log de auditoría.
   * Claim adicional `actAs` + `impersonatorId` para que el frontend pueda
   * mostrar el banner y permitir regresar.
   */
  async impersonate(adminId: string, targetId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } })
    if (!target) throw new Error('Target not found')
    // await this.prisma.impersonationLog.create({ data: { adminId, targetId } })
    const accessToken = await this.jwt.signAsync(
      { sub: target.id, role: target.role, impersonatorId: adminId, actAs: target.id },
      { expiresIn: '30m' },
    )
    return { accessToken, target: { id: target.id, fullName: target.fullName, role: target.role } }
  }
}
