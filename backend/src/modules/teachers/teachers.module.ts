import { Module } from '@nestjs/common'
import { TeachersController } from './teachers.controller'
import { TeachersService } from './teachers.service'
import { SchedulingModule } from '../scheduling/scheduling.module'
import { NotificationsModule } from '../notifications/notifications.module'
@Module({
  imports: [SchedulingModule, NotificationsModule],
  controllers: [TeachersController],
  providers: [TeachersService],
})
export class TeachersModule {}
