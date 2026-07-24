import { Module } from '@nestjs/common'
import { WompiController } from './wompi.controller'
import { WompiService } from './wompi.service'
import { SubscriptionsModule } from '../subscriptions/subscriptions.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [SubscriptionsModule, NotificationsModule],
  controllers: [WompiController],
  providers: [WompiService],
  exports: [WompiService],
})
export class WompiModule {}
