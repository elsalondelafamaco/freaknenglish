import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { SchedulingService, ScheduleBlock } from './scheduling.service'
import { SlotsService, SlotRef, ScheduleConfig } from './slots.service'

@ApiTags('scheduling')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class SchedulingController {
  constructor(private svc: SchedulingService, private slots: SlotsService) {}

  /** @endpoint GET /api/v1/schedule/availability-grid */
  @Get('schedule/availability-grid')
  grid() { return this.svc.availabilityGrid() }

  /** @endpoint GET /api/v1/schedule/mine */
  @Get('schedule/mine')
  mine(@CurrentUser() u: AuthUser) { return this.svc.mySchedule(u.id) }

  /** @endpoint POST /api/v1/schedule/availability  (renovación: ignora los slots propios) */
  @Post('schedule/availability')
  availability(@CurrentUser() u: AuthUser, @Body() body: { slots?: SlotRef[] }) {
    return this.slots.hints(body?.slots ?? [], u.id)
  }

  /** @endpoint GET /api/v1/admin/settings/schedule */
  @Roles('admin')
  @Get('admin/settings/schedule')
  scheduleConfig() { return this.slots.getConfig() }

  /** @endpoint POST /api/v1/admin/settings/schedule */
  @Roles('admin')
  @Post('admin/settings/schedule')
  updateScheduleConfig(@Body() body: Partial<ScheduleConfig>) { return this.slots.updateConfig(body) }

  /** @endpoint POST /api/v1/schedule/preferences  Body: { blocks:[{weekday,hour}] } */
  @Post('schedule/preferences')
  submit(@CurrentUser() u: AuthUser, @Body() body: { blocks: ScheduleBlock[] }) {
    return this.svc.submitPreferences(u.id, body.blocks)
  }

  /** @endpoint GET /api/v1/admin/calendar?from&to (todas las clases, AC-26) */
  @Roles('admin')
  @Get('admin/calendar')
  adminCalendar(@Query('from') from: string, @Query('to') to: string) {
    return this.svc.adminCalendar(new Date(from), new Date(to))
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

  /** @endpoint POST /api/v1/admin/teachers/:id/availability  Body: { slots:[{weekday,startsAt,endsAt}] } */
  @Roles('admin')
  @Post('admin/teachers/:id/availability')
  setAvail(@Param('id') id: string, @Body() body: { slots: Array<{ weekday: number; startsAt: string; endsAt: string }> }) {
    return this.svc.setTeacherAvailability(id, body.slots ?? [])
  }
}