import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { AdminService } from './admin.service'

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private svc: AdminService) {}

  /** @endpoint GET /api/v1/admin/analytics */
  @Get('analytics')
  analytics() { return this.svc.analytics() }

  /** @endpoint GET /api/v1/admin/users?q=foo */
  @Get('users')
  users(@Query('q') q?: string) { return this.svc.users(q) }

  /** @endpoint GET /api/v1/admin/payroll?period=YYYY-MM */
  @Get('payroll')
  payroll(@Query('period') period: string) { return this.svc.payroll(period) }
}
