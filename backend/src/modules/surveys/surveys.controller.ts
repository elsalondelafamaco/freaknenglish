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
   * Reglas de negocio:
   *   a) `last_class`  → el estudiante tiene una clase `scheduled` que es la
   *      última dentro de su `currentPeriodEnd` (o dentro de los próximos 7 d
   *      si no hay suscripción activa) y no ha respondido la encuesta de
   *      ese período.
   *   b) `period_ended` → la suscripción está `expired|past_due|canceled` y
   *      falta la encuesta del último período con actividad.
   */
  @Get('pending')
  async pending(@CurrentUser() u: AuthUser) {
    const now = new Date()
    const period = now.toISOString().slice(0, 7)
    const sub = await this.prisma.subscription.findUnique({ where: { userId: u.id } })
    const answered = await this.prisma.satisfactionSurvey.findUnique({
      where: { userId_period: { userId: u.id, period } },
    })
    if (answered) return { pending: false, period, reason: null }

    // (a) última clase del período programada y a punto de cursarse
    const periodEnd = sub?.currentPeriodEnd ?? new Date(now.getTime() + 7 * 86_400_000)
    const lastClass = await this.prisma.class.findFirst({
      where: { studentId: u.id, status: 'scheduled', startsAt: { lte: periodEnd } },
      orderBy: { startsAt: 'desc' },
    })
    if (lastClass) {
      const upcomingCount = await this.prisma.class.count({
        where: {
          studentId: u.id,
          status: 'scheduled',
          startsAt: { gte: lastClass.startsAt, lte: periodEnd },
        },
      })
      // Si esta clase es la última pendiente del período (upcomingCount === 1)
      // pedimos la encuesta antes de que la tome.
      if (upcomingCount <= 1) {
        return { pending: true, period, reason: 'last_class' as const }
      }
    }

    // (b) suscripción no activa y aún no respondió
    if (sub && ['expired', 'past_due', 'canceled'].includes(sub.status)) {
      return { pending: true, period, reason: 'period_ended' as const }
    }

    return { pending: false, period, reason: null }
  }

  /** @endpoint GET /api/v1/me/payments (histórico del usuario) */
}
