import { Module } from '@nestjs/common'
import { AdminPromotionsController, PublicPromotionsController } from './promotions.controller'
import { AuthModule } from '../auth/auth.module'
import { PromotionsService } from './promotions.service'

@Module({
  imports: [AuthModule],
  controllers: [AdminPromotionsController, PublicPromotionsController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
