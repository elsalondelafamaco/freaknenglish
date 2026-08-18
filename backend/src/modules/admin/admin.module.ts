import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { JwtModule } from '@nestjs/jwt'
import { env } from '../../config/env'
import { AdminController } from './admin.controller'
import { PublicSettingsController } from './public-settings.controller'
import { AdminService } from './admin.service'
import { StorageModule } from '../storage/storage.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { SchedulingModule } from '../scheduling/scheduling.module'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [
    BullModule.registerQueue({ name: 'automations' }),
    JwtModule.register({ secret: env.JWT_SECRET, signOptions: { expiresIn: '15m' } }),
    StorageModule,
    NotificationsModule,
    SchedulingModule,
    // Para firmar el vale de suplantación (ver auth.service).
    AuthModule,
  ],
  controllers: [AdminController, PublicSettingsController],
  providers: [AdminService],
})
export class AdminModule {}
