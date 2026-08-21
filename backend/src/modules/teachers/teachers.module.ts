import { Module } from '@nestjs/common'
import { TeachersController } from './teachers.controller'
import { TeachersService } from './teachers.service'
import { SchedulingModule } from '../scheduling/scheduling.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { LearningModule } from '../learning/learning.module'
import { StorageModule } from '../storage/storage.module'
@Module({
  // StorageModule: el profe firma la subida de los PDF que le deja a sus
  // estudiantes. Los tres endpoints de firma que había eran de admin o de
  // boards, ninguno servía.
  imports: [SchedulingModule, NotificationsModule, LearningModule, StorageModule],
  controllers: [TeachersController],
  providers: [TeachersService],
})
export class TeachersModule {}
