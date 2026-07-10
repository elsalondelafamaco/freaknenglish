import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { NotificationsService } from './notifications.service'

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  /** @endpoint GET /api/v1/notifications?unread=1 */
  @Get()
  list(@CurrentUser() u: AuthUser, @Query('unread') unread?: string, @Query('limit') limit?: string) {
    return this.svc.listForUser(u.id, {
      unreadOnly: unread === '1' || unread === 'true',
      limit: limit ? Number(limit) : undefined,
    })
  }

  /** @endpoint GET /api/v1/notifications/unread-count */
  @Get('unread-count')
  unread(@CurrentUser() u: AuthUser) {
    return this.svc.unreadCount(u.id).then((count) => ({ count }))
  }

  /** @endpoint POST /api/v1/notifications/:id/read */
  @Post(':id/read')
  read(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.markRead(u.id, id)
  }

  /** @endpoint POST /api/v1/notifications/read-all */
  @Post('read-all')
  readAll(@CurrentUser() u: AuthUser) {
    return this.svc.markAllRead(u.id)
  }
}