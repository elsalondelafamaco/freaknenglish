import { Module } from '@nestjs/common'
import { LearningController } from './learning.controller'
import { LearningService } from './learning.service'
import { NotificationsModule } from '../notifications/notifications.module'
@Module({
  imports: [NotificationsModule],
  controllers: [LearningController],
  providers: [LearningService],
})
export class LearningModule {}
