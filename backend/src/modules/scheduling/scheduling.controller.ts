import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { ActiveSubscriptionGuard } from '../../common/guards/active-subscription.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { SchedulingService, ScheduleBlock } from './scheduling.service'
import { SlotsService, SlotRef, ScheduleConfig } from './slots.service'

@ApiTags('scheduling')
@ApiBearerAuth()
// ActiveSubscriptionGuard: el calendario/horarios de estudiante exige sub
// activa (la selección de horario del checkout usa public/schedule, no esto).
@UseGuards(JwtAuthGuard, RolesGuard, ActiveSubscriptionGuard)
@Controller()
export class SchedulingController {
  constructor(private svc: SchedulingService, private slots: SlotsService) {}

  /** @endpoint GET /api/v1/schedule/availability-grid */
  @Get('schedule/availability-grid')
  grid() { return this.svc.availabilityGrid() }

  /** @endpoint GET /api/v1/schedule/mine */
  @Get('schedule/mine')
  mine(@CurrentUser() u: AuthUser) { return this.svc.mySchedule(u.id) }

  /**
   * @endpoint POST /api/v1/schedule/availability  (renovación: ignora los slots propios)
   * Body: { slots, planId? } — sin `planId` se usa el plan de su suscripción,
   * para no marcar como disponibles profes que no cubren el plan completo.
   */
  @Post('schedule/availability')
  async availability(
    @CurrentUser() u: AuthUser,
    @Body() body: { slots?: SlotRef[]; planId?: string },
  ) {
    return this.slots.hints(body?.slots ?? [], u.id, await this.svc.diasPorSemanaDe(u.id, body?.planId))
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

  /** @endpoint GET /api/v1/admin/availability  (todos los profes, para el calendario) */
  @Roles('admin')
  @Get('admin/availability')
  allAvailability() { return this.svc.allTeachersAvailability() }

  /** @endpoint GET /api/v1/admin/schedule/audit  (horarios que no caben en la disponibilidad del profe) */
  @Roles('admin')
  @Get('admin/schedule/audit')
  scheduleAudit() { return this.svc.auditScheduleFit() }

  /** @endpoint GET /api/v1/admin/users/:id/schedule  (horario vigente, para el editor) */
  @Roles('admin')
  @Get('admin/users/:id/schedule')
  studentSchedule(@Param('id') id: string) { return this.svc.studentSchedule(id) }

  /**
   * @endpoint PATCH /api/v1/admin/users/:id/schedule
   * Cambia el horario semanal de un estudiante ya creado y rehace sus clases
   * futuras. Body: { blocks:[{weekday,hour}], teacherId?: string|null }
   */
  @Roles('admin')
  @Patch('admin/users/:id/schedule')
  setStudentSchedule(
    @Param('id') id: string,
    @Body() body: { blocks: ScheduleBlock[]; teacherId?: string | null },
  ) {
    return this.svc.setStudentSchedule(id, body?.blocks ?? [], body?.teacherId)
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