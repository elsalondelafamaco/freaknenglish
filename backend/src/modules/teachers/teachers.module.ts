import { Module } from '@nestjs/common'
import { TeachersController } from './teachers.controller'
import { TeachersService } from './teachers.service'
import { SchedulingModule } from '../scheduling/scheduling.module'
@Module({
  imports: [SchedulingModule],
  controllers: [TeachersController],
  providers: [TeachersService],
})
export class TeachersModule {}
