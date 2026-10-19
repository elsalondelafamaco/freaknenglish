import { Module } from '@nestjs/common'
import { WompiController } from './wompi.controller'
import { WompiService } from './wompi.service'
import { MetaCapiService } from '../meta/meta-capi.service'
import { SubscriptionsModule } from '../subscriptions/subscriptions.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { SchedulingModule } from '../scheduling/scheduling.module'

@Module({
  imports: [SubscriptionsModule, NotificationsModule, SchedulingModule],
  controllers: [WompiController],
  providers: [WompiService, MetaCapiService],
  exports: [WompiService],
})
export class WompiModule {}
