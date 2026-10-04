import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { env } from '../../config/env'
import { AutomationsProcessor } from './automations.processor'
import { AutomationsService } from './automations.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { SchedulingModule } from '../scheduling/scheduling.module'
import { AdminModule } from '../admin/admin.module'

@Module({
  imports: [
    BullModule.forRoot({
      connection: { url: env.REDIS_URL },
    }),
    BullModule.registerQueue({ name: 'automations' }),
    NotificationsModule,
    SchedulingModule,
    AdminModule,
  ],
  providers: [AutomationsProcessor, AutomationsService],
  exports: [AutomationsService],
})
export class JobsModule {}
