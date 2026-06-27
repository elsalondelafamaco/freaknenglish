import { Module } from '@nestjs/common'
import { NotificationsService } from './notifications.service'
import { ResendTransport } from './resend.transport'

@Module({
  providers: [NotificationsService, ResendTransport],
  exports: [NotificationsService],
})
export class NotificationsModule {}
