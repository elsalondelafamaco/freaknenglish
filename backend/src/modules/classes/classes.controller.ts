import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { ClassesService } from './classes.service'

@ApiTags('classes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('classes')
export class ClassesController {
  constructor(private svc: ClassesService) {}

  /** @endpoint GET /api/v1/classes */
  @Get()
  list(@CurrentUser() u: AuthUser) {
    return u.role === 'teacher' ? this.svc.listForTeacher(u.id) : this.svc.listForStudent(u.id)
  }

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

  /** @endpoint POST /api/v1/classes/:id/reschedule */
  @Post(':id/reschedule')
  reschedule(
    @Param('id') id: string,
    @CurrentUser() u: AuthUser,
    @Body() body: { startsAt: string; endsAt: string },
  ) {
    return this.svc.reschedule(id, u.id, new Date(body.startsAt), new Date(body.endsAt))
  }

  /** @endpoint POST /api/v1/classes/:id/cancel */
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() u: AuthUser, @Body() body: { reason?: string }) {
    return this.svc.cancel(id, u.id, body.reason)
  }
}
