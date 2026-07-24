import { Module } from '@nestjs/common'
import { CheckoutController } from './checkout.controller'
import { CheckoutService } from './checkout.service'
import { WompiModule } from '../wompi/wompi.module'
import { ExchangeModule } from '../exchange/exchange.module'
import { SchedulingModule } from '../scheduling/scheduling.module'

@Module({
  imports: [WompiModule, ExchangeModule, SchedulingModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
