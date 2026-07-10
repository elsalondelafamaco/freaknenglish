import { Module } from '@nestjs/common'
import { NotificationsService } from './notifications.service'
import { ResendTransport } from './resend.transport'
import { NotificationsController } from './notifications.controller'

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, ResendTransport],
  exports: [NotificationsService],
})
export class NotificationsModule {}
