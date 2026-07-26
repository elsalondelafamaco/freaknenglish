import { Module } from '@nestjs/common'
import { LearningController } from './learning.controller'
import { LearningService } from './learning.service'
import { ContentSyncService } from './content-sync.service'
import { NotificationsModule } from '../notifications/notifications.module'
@Module({
  imports: [NotificationsModule],
  controllers: [LearningController],
  providers: [LearningService, ContentSyncService],
  exports: [LearningService],
})
export class LearningModule {}
