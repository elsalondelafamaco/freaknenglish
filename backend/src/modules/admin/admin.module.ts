import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { JwtModule } from '@nestjs/jwt'
import { env } from '../../config/env'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'

@Module({
  imports: [
    BullModule.registerQueue({ name: 'automations' }),
    JwtModule.register({ secret: env.JWT_SECRET, signOptions: { expiresIn: '15m' } }),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
