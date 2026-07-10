import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { ReceiptsService } from './receipts.service'

@Module({
  controllers: [UsersController],
  providers: [UsersService, ReceiptsService],
  exports: [UsersService],
})
export class UsersModule {}
