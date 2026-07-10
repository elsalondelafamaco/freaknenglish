import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
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

  /** @endpoint POST /api/v1/boards/:id/invite-by-email */
  @Post(':id/invite-by-email')
  inviteByEmail(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() body: { email: string; role?: 'editor' | 'viewer' },
  ) {
    return this.svc.inviteByEmail(id, u.id, body.email, body.role)
  }

  /** @endpoint POST /api/v1/boards/:id/uploads/sign */
  @Post(':id/uploads/sign')
  signUpload(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() body: { filename: string; contentType?: string },
  ) {
    return this.svc.signBoardUpload(id, u.id, body)
  }

  // ─── Pages ────────────────────────────────────────────────────────
  /** @endpoint GET /api/v1/boards/:id/pages */
  @Get(':id/pages')
  listPages(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.listPages(id, u.id)
  }

  /** @endpoint POST /api/v1/boards/:id/pages */
  @Post(':id/pages')
  createPage(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() body: { title?: string; kind?: string },
  ) {
    return this.svc.createPage(id, u.id, body ?? {})
  }

  /** @endpoint PATCH /api/v1/boards/pages/:pageId */
  @Patch('pages/:pageId')
  updatePage(
    @CurrentUser() u: AuthUser,
    @Param('pageId') pageId: string,
    @Body() body: { title?: string; position?: number },
  ) {
    if (typeof body.position === 'number') {
      return this.svc.reorderPage(pageId, u.id, body.position)
    }
    return this.svc.renamePage(pageId, u.id, body.title ?? 'Página')
  }

  /** @endpoint DELETE /api/v1/boards/pages/:pageId */
  @Delete('pages/:pageId')
  deletePage(@CurrentUser() u: AuthUser, @Param('pageId') pageId: string) {
    return this.svc.deletePage(pageId, u.id)
  }

  /** @endpoint GET /api/v1/boards/pages/:pageId/state */
  @Get('pages/:pageId/state')
  pageState(@CurrentUser() u: AuthUser, @Param('pageId') pageId: string) {
    return this.svc.getPageState(pageId, u.id)
  }

  /** @endpoint GET /api/v1/boards/pages/:pageId/ops?since=N */
  @Get('pages/:pageId/ops')
  pageOps(
    @CurrentUser() u: AuthUser,
    @Param('pageId') pageId: string,
    @Query('since') since: string,
  ) {
    return this.svc.pageOpsSince(pageId, u.id, Number(since) || 0)
  }

  /** @endpoint GET /api/v1/boards/pages/:pageId/versions */
  @Get('pages/:pageId/versions')
  listVersions(@CurrentUser() u: AuthUser, @Param('pageId') pageId: string) {
    return this.svc.listVersions(pageId, u.id)
  }

  /** @endpoint POST /api/v1/boards/pages/:pageId/versions */
  @Post('pages/:pageId/versions')
  saveVersion(
    @CurrentUser() u: AuthUser,
    @Param('pageId') pageId: string,
    @Body() body: { label?: string },
  ) {
    return this.svc.saveVersion(pageId, u.id, body?.label)
  }

  /** @endpoint POST /api/v1/boards/versions/:versionId/restore */
  @Post('versions/:versionId/restore')
  restoreVersion(@CurrentUser() u: AuthUser, @Param('versionId') versionId: string) {
    return this.svc.restoreVersion(versionId, u.id)
  }
}
