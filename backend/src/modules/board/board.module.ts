import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { BoardController } from './board.controller'
import { BoardService } from './board.service'
import { BoardGateway } from './board.gateway'

@Module({ imports: [AuthModule], controllers: [BoardController], providers: [BoardService, BoardGateway] })
export class BoardModule {}
