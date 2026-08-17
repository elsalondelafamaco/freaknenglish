import { Module } from '@nestjs/common'
import { ClassesController } from './classes.controller'
import { ClassesService } from './classes.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { SchedulingModule } from '../scheduling/scheduling.module'
@Module({
  imports: [NotificationsModule, SchedulingModule],
  controllers: [ClassesController],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}
