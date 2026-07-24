import { Module } from '@nestjs/common'
import { SchedulingController } from './scheduling.controller'
import { PublicScheduleController } from './public-schedule.controller'
import { SchedulingService } from './scheduling.service'
import { SlotsService } from './slots.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { BoardModule } from '../board/board.module'

@Module({
  imports: [NotificationsModule, BoardModule],
  controllers: [SchedulingController, PublicScheduleController],
  providers: [SchedulingService, SlotsService],
  exports: [SchedulingService, SlotsService],
})
export class SchedulingModule {}
