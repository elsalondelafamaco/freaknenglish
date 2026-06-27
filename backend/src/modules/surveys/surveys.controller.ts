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
   * @endpoint GET /api/v1/surveys/pending  → { pending: boolean, period: string }
   * Frecuencia objetivo: cada 30 días desde la última respuesta.
   */
  @Get('pending')
  async pending(@CurrentUser() u: AuthUser) {
    const last = await this.prisma.satisfactionSurvey.findFirst({
      where: { userId: u.id },
      orderBy: { createdAt: 'desc' },
    })
    const period = new Date().toISOString().slice(0, 7)
    if (!last) return { pending: true, period }
    const ageDays = (Date.now() - new Date(last.createdAt).getTime()) / 86_400_000
    return { pending: ageDays >= 30, period, lastAnsweredAt: last.createdAt }
  }
}
