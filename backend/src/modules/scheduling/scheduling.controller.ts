import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { SchedulingService, ScheduleBlock } from './scheduling.service'

@ApiTags('scheduling')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class SchedulingController {
  constructor(private svc: SchedulingService) {}

  /** @endpoint GET /api/v1/schedule/availability-grid */
  @Get('schedule/availability-grid')
  grid() { return this.svc.availabilityGrid() }

  /** @endpoint GET /api/v1/schedule/mine */
  @Get('schedule/mine')
  mine(@CurrentUser() u: AuthUser) { return this.svc.mySchedule(u.id) }

  /** @endpoint POST /api/v1/schedule/preferences  Body: { blocks:[{weekday,hour}] } */
  @Post('schedule/preferences')
  submit(@CurrentUser() u: AuthUser, @Body() body: { blocks: ScheduleBlock[] }) {
    return this.svc.submitPreferences(u.id, body.blocks)
  }

  /** @endpoint GET /api/v1/admin/schedule/requests */
  @Roles('admin')
  @Get('admin/schedule/requests')
  pending() { return this.svc.pendingRequests() }

  /** @endpoint POST /api/v1/admin/schedule/requests/:id/assign  Body: { teacherId } */
  @Roles('admin')
  @Post('admin/schedule/requests/:id/assign')
  assign(@Param('id') id: string, @Body() body: { teacherId: string }) {
    return this.svc.assignRequest(id, body.teacherId)
  }

  /** @endpoint GET /api/v1/admin/teachers/:id/availability */
  @Roles('admin')
  @Get('admin/teachers/:id/availability')
  getAvail(@Param('id') id: string) { return this.svc.getTeacherAvailability(id) }

  /** @endpoint PUT /api/v1/admin/teachers/:id/availability  Body: { slots:[{weekday,startsAt,endsAt}] } */
  @Roles('admin')
  @Put('admin/teachers/:id/availability')
  setAvail(@Param('id') id: string, @Body() body: { slots: Array<{ weekday: number; startsAt: string; endsAt: string }> }) {
    return this.svc.setTeacherAvailability(id, body.slots ?? [])
  }
}