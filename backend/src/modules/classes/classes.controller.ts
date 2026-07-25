import { Body, Controller, Get, Param, Patch, Post, UseGuards, ForbiddenException } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { ActiveSubscriptionGuard } from '../../common/guards/active-subscription.guard'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { ClassesService } from './classes.service'

@ApiTags('classes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ActiveSubscriptionGuard)
@Controller('classes')
export class ClassesController {
  constructor(private svc: ClassesService) {}

  /** @endpoint GET /api/v1/classes */
  @Get()
  list(@CurrentUser() u: AuthUser) {
    return u.role === 'teacher' ? this.svc.listForTeacher(u.id) : this.svc.listForStudent(u.id)
  }

  /** @endpoint GET /api/v1/classes/upcoming  (student dashboard) */
  @Get('upcoming')
  upcoming(@CurrentUser() u: AuthUser) { return this.svc.upcoming(u.id) }

  /** @endpoint GET /api/v1/classes/today  (teacher dashboard) */
  @Get('today')
  today(@CurrentUser() u: AuthUser) { return this.svc.todayForTeacher(u.id) }

  /** @endpoint POST /api/v1/classes/:id/confirm  (student) */
  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.svc.studentConfirm(id, u.id)
  }

  /** @endpoint POST /api/v1/classes/:id/validate  (teacher) */
  @Post(':id/validate')
  validate(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.svc.validateAttendance(id, u.id)
  }

  /** @endpoint POST /api/v1/classes/:id/no-show  (teacher) */
  @Post(':id/no-show')
  noShow(@Param('id') id: string, @CurrentUser() u: AuthUser) {
    return this.svc.markNoShow(id, u.id)
  }

  /**
   * @endpoint POST /api/v1/classes/:id/reschedule
   * One-off: mueve SOLO esta clase (incluso a otra semana) sin cambiar el
   * horario recurrente. Profesor de la clase o admin.
   */
  @Post(':id/reschedule')
  reschedule(
    @Param('id') id: string,
    @CurrentUser() u: AuthUser,
    @Body() body: { startsAt: string; endsAt: string },
  ) {
    // SDD-scheduling-v2 AC-25: el estudiante coordina cambios con su profesor.
    if (u.role === 'student') throw new ForbiddenException('Coordina el cambio de horario con tu profesor')
    return this.svc.reschedule(id, u, new Date(body.startsAt), new Date(body.endsAt))
  }

  /** @endpoint POST /api/v1/classes/:id/cancel */
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() u: AuthUser, @Body() body: { reason?: string }) {
    if (u.role === 'student') throw new ForbiddenException('Coordina la cancelación con tu profesor')
    return this.svc.cancel(id, u, body.reason)
  }

  /**
   * @endpoint PATCH /api/v1/classes/:id/status  (solo admin)
   * Ajuste manual: fuerza tomada/no tomada/programada/cancelada — se refleja
   * en nómina y métricas.
   */
  @Roles('admin')
  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body() body: { status: 'validated' | 'no_show' | 'scheduled' | 'cancelled' },
  ) {
    return this.svc.adminSetStatus(id, body.status)
  }

  /**
   * @endpoint POST /api/v1/classes/:id/report
   * El estudiante reporta un problema con una clase ya dictada → email +
   * notificación in-app a los admins.
   */
  @Post(':id/report')
  report(@Param('id') id: string, @CurrentUser() u: AuthUser, @Body() body: { note: string }) {
    return this.svc.reportClass(id, u.id, body?.note ?? '')
  }
}
