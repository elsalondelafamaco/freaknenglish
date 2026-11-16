import { Module } from '@nestjs/common'
import { WompiController } from './wompi.controller'
import { WompiService } from './wompi.service'
import { MetaCapiService } from '../meta/meta-capi.service'
import { WompiApi } from './wompi-api'
import { SubscriptionsModule } from '../subscriptions/subscriptions.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { SchedulingModule } from '../scheduling/scheduling.module'

@Module({
  imports: [SubscriptionsModule, NotificationsModule, SchedulingModule],
  controllers: [WompiController],
  providers: [WompiService, MetaCapiService, WompiApi],
  exports: [WompiService, WompiApi],
})
export class WompiModule {}
