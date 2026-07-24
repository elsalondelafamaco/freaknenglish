import { Body, Controller, Get, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { SlotsService, SlotRef } from './slots.service'

/**
 * Endpoints públicos del picker de horario (checkout, usuario aún anónimo).
 * AC-6: las respuestas solo contienen booleanos — jamás datos de profesores.
 */
@ApiTags('public')
@Controller('public/schedule')
export class PublicScheduleController {
  constructor(private slots: SlotsService) {}

  /** @endpoint GET /api/v1/public/schedule/config */
  @Get('config')
  config() { return this.slots.getConfig() }

  /** @endpoint POST /api/v1/public/schedule/availability  Body: { slots: [{weekday,hour}] } */
  @Post('availability')
  availability(@Body() body: { slots?: SlotRef[] }) {
    return this.slots.hints(body?.slots ?? [])
  }
}
