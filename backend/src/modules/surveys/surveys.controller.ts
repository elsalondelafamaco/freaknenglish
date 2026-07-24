import { Body, Controller, Get, Post, UseGuards, BadRequestException } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

@ApiTags('surveys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('surveys')
export class SurveysController {
  constructor(private prisma: PrismaService) {}
  /**
   * @endpoint POST /api/v1/surveys/nps
   * Body: { score, teacherScore, contentScore, platformScore, comment? }
   * Solo estudiantes — pero no aplicamos guard por rol porque admins también
   * podrían registrar respuestas de soporte. El reporting filtra por role.
   */
  @Post('nps')
  async nps(
    @CurrentUser() u: AuthUser,
    @Body()
    body: {
      score: number
      teacherScore?: number
      contentScore?: number
      platformScore?: number
      comment?: string
    },
  ) {
    if (body.score == null || body.score < 0 || body.score > 10) {
      throw new BadRequestException('score must be between 0 and 10')
    }
    const checkScale = (v: number | undefined, name: string) => {
      if (v == null) return
      if (v < 1 || v > 5) throw new BadRequestException(`${name} must be 1..5`)
    }
    checkScale(body.teacherScore, 'teacherScore')
    checkScale(body.contentScore, 'contentScore')
    checkScale(body.platformScore, 'platformScore')

    const period = new Date().toISOString().slice(0, 7) // YYYY-MM
    return this.prisma.satisfactionSurvey.upsert({
      where: { userId_period: { userId: u.id, period } },
      update: {
        score: body.score,
        teacherScore: body.teacherScore,
        contentScore: body.contentScore,
        platformScore: body.platformScore,
        comment: body.comment,
      },
      create: {
        userId: u.id,
        score: body.score,
        teacherScore: body.teacherScore,
        contentScore: body.contentScore,
        platformScore: body.platformScore,
        comment: body.comment,
        period,
      },
    })
  }

  /**
   * @endpoint GET /api/v1/surveys/pending  → { pending, period, reason }
   *
   * Reglas (definidas por producto):
   *   a) `last_class`   → suscripción ACTIVA y solo queda 1 clase programada
   *      en el período (estamos entre la penúltima y la última).
   *   b) `period_ended` → la suscripción venció/cesó y hubo actividad.
   *   En ambos casos, solo si NO respondió desde que inició el período actual
   *   de su suscripción (una vez resuelta, no reaparece hasta el siguiente
   *   ciclo en la misma ventana o al expirar).
   */
  @Get('pending')
  async pending(@CurrentUser() u: AuthUser) {
    const now = new Date()
    const period = now.toISOString().slice(0, 7)
    const sub = await this.prisma.subscription.findUnique({ where: { userId: u.id } })
    if (!sub) return { pending: false, period, reason: null }

    // ¿Ya respondió durante este ciclo de suscripción?
    const periodStart = sub.startedAt ?? sub.createdAt ?? new Date(0)
    const answered = await this.prisma.satisfactionSurvey.findFirst({
      where: { userId: u.id, createdAt: { gte: periodStart } },
      select: { id: true },
    })
    if (answered) return { pending: false, period, reason: null }

    // (a) activa y entre la penúltima y la última clase del período.
    if (sub.status === 'active' && sub.currentPeriodEnd) {
      const remaining = await this.prisma.class.count({
        where: {
          studentId: u.id,
          status: 'scheduled',
          startsAt: { gt: now, lte: sub.currentPeriodEnd },
        },
      })
      const taken = await this.prisma.class.count({
        where: { studentId: u.id, status: 'validated', validatedAt: { gte: periodStart } },
      })
      if (remaining === 1 && taken >= 1) {
        return { pending: true, period, reason: 'last_class' as const }
      }
      return { pending: false, period, reason: null }
    }

    // (b) suscripción vencida/cesada con actividad previa.
    if (['expired', 'past_due', 'canceled'].includes(sub.status)) {
      const hadClasses = await this.prisma.class.count({ where: { studentId: u.id } })
      if (hadClasses > 0) return { pending: true, period, reason: 'period_ended' as const }
    }

    return { pending: false, period, reason: null }
  }

  /** @endpoint GET /api/v1/me/payments (histórico del usuario) */
}
