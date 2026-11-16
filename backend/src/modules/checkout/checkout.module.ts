import { Module } from '@nestjs/common'
import { CheckoutController } from './checkout.controller'
import { CheckoutService } from './checkout.service'
import { PagoDirectoService } from './pago-directo.service'
import { WompiModule } from '../wompi/wompi.module'
import { ExchangeModule } from '../exchange/exchange.module'
import { SchedulingModule } from '../scheduling/scheduling.module'
import { PromotionsModule } from '../promotions/promotions.module'

@Module({
  imports: [WompiModule, ExchangeModule, SchedulingModule, PromotionsModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, PagoDirectoService],
})
export class CheckoutModule {}
