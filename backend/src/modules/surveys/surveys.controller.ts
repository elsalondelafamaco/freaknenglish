import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
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
  /** @endpoint POST /api/v1/surveys/nps */
  @Post('nps')
  async nps(@CurrentUser() u: AuthUser, @Body() body: { score: number; comment?: string }) {
    const period = new Date().toISOString().slice(0, 7) // YYYY-MM
    return this.prisma.satisfactionSurvey.upsert({
      where: { userId_period: { userId: u.id, period } },
      update: { score: body.score, comment: body.comment },
      create: { userId: u.id, score: body.score, comment: body.comment, period },
    })
  }

  /** @endpoint GET /api/v1/surveys/pending  → { pending: boolean, period: string } */
  @Get('pending')
  async pending(@CurrentUser() u: AuthUser) {
    const period = new Date().toISOString().slice(0, 7)
    const existing = await this.prisma.satisfactionSurvey.findUnique({
      where: { userId_period: { userId: u.id, period } },
    })
    return { pending: !existing, period }
  }
}
