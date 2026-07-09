import { Module } from '@nestjs/common'
import { PlansController } from './plans.controller'
import { ExchangeModule } from '../exchange/exchange.module'
@Module({ imports: [ExchangeModule], controllers: [PlansController] })
export class PlansModule {}
