import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { UsersService } from './users.service'

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class UsersController {
  constructor(private users: UsersService) {}

  /** @endpoint GET /api/v1/me */
  @Get()
  me(@CurrentUser() user: AuthUser) { return this.users.me(user.id) }

  /** @endpoint PATCH /api/v1/me */
  @Patch()
  update(
    @CurrentUser() user: AuthUser,
    @Body() body: { fullName?: string; phone?: string; avatarUrl?: string },
  ) {
    return this.users.update(user.id, body)
  }
}
