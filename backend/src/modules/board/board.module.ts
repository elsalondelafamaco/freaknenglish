import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { StorageModule } from '../storage/storage.module'
import { BoardController } from './board.controller'
import { BoardService } from './board.service'
import { BoardGateway } from './board.gateway'

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [BoardController],
  providers: [BoardService, BoardGateway],
  exports: [BoardService],
})
export class BoardModule {}
