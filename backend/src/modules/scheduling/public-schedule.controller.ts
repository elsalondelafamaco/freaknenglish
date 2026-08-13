import { Body, Controller, Get, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { SlotsService, SlotRef } from './slots.service'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * Endpoints públicos del picker de horario (checkout, usuario aún anónimo).
 * AC-6: las respuestas solo contienen booleanos — jamás datos de profesores.
 */
@ApiTags('public')
@Controller('public/schedule')
export class PublicScheduleController {
  constructor(private slots: SlotsService, private prisma: PrismaService) {}

  /** @endpoint GET /api/v1/public/schedule/config */
  @Get('config')
  config() { return this.slots.getConfig() }

  /**
   * @endpoint POST /api/v1/public/schedule/availability
   * Body: { slots: [{weekday,hour}], planId? }
   * El id del plan se usa para saber cuántas clases pide: un profe que no
   * puede cubrirlas todas no cuenta como disponible.
   */
  @Post('availability')
  async availability(@Body() body: { slots?: SlotRef[]; planId?: string }) {
    return this.slots.hints(body?.slots ?? [], undefined, await this.diasDelPlan(body?.planId))
  }

  /** daysPerWeek del plan, o undefined si no vino o no existe. */
  private async diasDelPlan(planId?: string): Promise<number | undefined> {
    if (!planId) return undefined
    const plan = await this.prisma.plan.findUnique({ where: { id: planId }, select: { daysPerWeek: true } })
    return plan?.daysPerWeek
  }
}
