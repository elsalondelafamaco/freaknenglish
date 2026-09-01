import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { ActiveSubscriptionGuard } from '../../common/guards/active-subscription.guard'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { BoardService, MAX_UPDATE_BYTES } from './board.service'
import { BoardGateway } from './board.gateway'

@ApiTags('boards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
@Controller('boards')
export class BoardController {
  // El gateway se inyecta aquí y no en el servicio: `BoardGateway` ya depende
  // de `BoardService`, así que al revés habría ciclo — y `BoardService` lo usa
  // `SchedulingService`, que no tiene por qué arrastrar el websocket.
  constructor(private svc: BoardService, private gateway: BoardGateway) {}

  /** @endpoint GET /api/v1/boards */
  @Get()
  list(@CurrentUser() u: AuthUser) { return this.svc.list(u.id, u.role) }

  /**
   * @endpoint GET /api/v1/boards/health  (aulas duplicadas; solo admin)
   * Va ANTES de `@Get(':id')`: si no, Nest lo tomaría por el id de un board.
   */
  @Get('health')
  aulasHealth(@CurrentUser() u: AuthUser) {
    if (u.role !== 'admin') throw new ForbiddenException('Solo administradores')
    return this.svc.diagnosticarAulas()
  }

  /** @endpoint POST /api/v1/boards/health/repair  (fusiona las duplicadas) */
  @Post('health/repair')
  aulasRepair(@CurrentUser() u: AuthUser) {
    if (u.role !== 'admin') throw new ForbiddenException('Solo administradores')
    return this.svc.repararAulas()
  }

  /** @endpoint POST /api/v1/boards */
  @Post()
  create(@CurrentUser() u: AuthUser, @Body() body: { name?: string; studentId?: string }) {
    return this.svc.create(u.id, u.role, body?.name ?? '', body?.studentId)
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

  /**
   * @endpoint POST /api/v1/boards/pages/:pageId/ops
   * Fallback REST de persistencia: si el socket no está disponible, el cliente
   * guarda los updates Yjs por aquí (idempotente por clientOpId).
   */
  @Post('pages/:pageId/ops')
  async appendPageOp(
    @CurrentUser() u: AuthUser,
    @Param('pageId') pageId: string,
    @Body() body: { update: string; clientOpId: string },
  ) {
    const buf = Buffer.from(body?.update ?? '', 'base64')
    if (buf.length === 0) throw new BadRequestException({ code: 'empty_update', message: 'Update vacío' })
    if (buf.length > MAX_UPDATE_BYTES) {
      throw new BadRequestException({
        code: 'update_too_large',
        message: `El cambio pesa ${Math.round(buf.length / 1024)} KB y el máximo es ${Math.round(MAX_UPDATE_BYTES / 1024)} KB.`,
        max: MAX_UPDATE_BYTES,
        size: buf.length,
      })
    }
    const op = await this.svc.appendPageOp({ pageId, userId: u.id, update: buf, clientOpId: body.clientOpId })
    // Y se reemite: guardar sin avisar era la mitad de por qué el board "no
    // iba en tiempo real" — lo escrito por esta vía solo salía al recargar.
    this.gateway.broadcastPageOp(pageId, op, body.update)
    return { ok: true, seq: op.seq }
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
