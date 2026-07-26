import { Module } from '@nestjs/common'
import { SchedulingController } from './scheduling.controller'
import { PublicScheduleController } from './public-schedule.controller'
import { SchedulingService } from './scheduling.service'
import { SlotsService } from './slots.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { BoardModule } from '../board/board.module'
import { SubscriptionsModule } from '../subscriptions/subscriptions.module'

@Module({
  imports: [NotificationsModule, BoardModule, SubscriptionsModule],
  controllers: [SchedulingController, PublicScheduleController],
  providers: [SchedulingService, SlotsService],
  exports: [SchedulingService, SlotsService],
})
export class SchedulingModule {}
