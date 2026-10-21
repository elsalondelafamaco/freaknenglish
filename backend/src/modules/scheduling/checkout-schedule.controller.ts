import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { SchedulingService } from './scheduling.service'
import { SlotsService, SlotRef } from './slots.service'

/**
 * Horario en el checkout, para quien ya tiene sesión.
 *
 * Va aparte de `SchedulingController` a propósito: aquel exige suscripción
 * activa, y quien está comprando un plan puede no tenerla —se le venció y
 * vuelve, o compra uno de más días—. Ahí recibía un 403 y el paso lo
 * disimulaba dando el horario por disponible.
 */
@ApiTags('scheduling')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('checkout/schedule')
export class CheckoutScheduleController {
  constructor(private svc: SchedulingService, private slots: SlotsService) {}

  /**
   * @endpoint POST /api/v1/checkout/schedule/sugerencias
   * Igual que la pública, pero sin contar sus propias franjas como ocupadas (si
   * cambia de plan, su hora de siempre sigue siendo suya) y con su duración de
   * clase real.
   */
  @Post('sugerencias')
  async sugerencias(@CurrentUser() u: AuthUser, @Body() body: { slots?: SlotRef[]; planId?: string }) {
    const slots = body?.slots ?? []
    const dias = (await this.svc.diasPorSemanaDe(u.id, body?.planId)) ?? slots.length
    return this.slots.sugerirHorarios(slots, dias, await this.svc.duracionDe(u.id), u.id)
  }
}
