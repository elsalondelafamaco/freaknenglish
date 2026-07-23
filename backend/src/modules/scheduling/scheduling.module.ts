import { Module } from '@nestjs/common'
import { SchedulingController } from './scheduling.controller'
import { SchedulingService } from './scheduling.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { BoardModule } from '../board/board.module'

@Module({
  imports: [NotificationsModule, BoardModule],
  controllers: [SchedulingController],
  providers: [SchedulingService],
  exports: [SchedulingService],
})
export class SchedulingModule {}