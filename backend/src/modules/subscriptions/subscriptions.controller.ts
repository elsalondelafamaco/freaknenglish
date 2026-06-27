import { Controller, Get, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { SubscriptionsService } from './subscriptions.service'

@ApiTags('subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private svc: SubscriptionsService) {}
  /** @endpoint GET /api/v1/subscriptions/mine */
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) { return this.svc.mine(user.id) }

  /** @endpoint POST /api/v1/subscriptions/cancel */
  @Post('cancel')
  cancel(@CurrentUser() user: AuthUser) { return this.svc.cancel(user.id) }

  /** @endpoint POST /api/v1/subscriptions/resume */
  @Post('resume')
  resume(@CurrentUser() user: AuthUser) { return this.svc.resume(user.id) }
}
