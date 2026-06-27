import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { BoardService } from './board.service'

@ApiTags('boards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('boards')
export class BoardController {
  constructor(private svc: BoardService) {}

  /** @endpoint GET /api/v1/boards */
  @Get()
  list(@CurrentUser() u: AuthUser) { return this.svc.list(u.id) }

  /** @endpoint POST /api/v1/boards */
  @Post()
  create(@CurrentUser() u: AuthUser, @Body() body: { name: string }) {
    return this.svc.create(u.id, body.name)
  }

  /** @endpoint GET /api/v1/boards/:id */
  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.get(id, u.id) }

  /** @endpoint GET /api/v1/boards/:id/ops?since=42 (used for catch-up after reconnect) */
  @Get(':id/ops')
  ops(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Query('since') since: string,
  ) {
    return this.svc.opsSince(id, u.id, Number(since) || 0)
  }

  /** @endpoint POST /api/v1/boards/:id/invite */
  @Post(':id/invite')
  invite(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() body: { userId: string; role?: 'editor' | 'viewer' },
  ) {
    return this.svc.invite(id, u.id, body.userId, body.role)
  }
}
