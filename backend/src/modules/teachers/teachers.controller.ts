import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { TeachersService } from './teachers.service'
import { SchedulingService } from '../scheduling/scheduling.service'

@ApiTags('teachers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'admin')
@Controller('teacher')
export class TeachersController {
  constructor(private svc: TeachersService, private scheduling: SchedulingService) {}

  /** @endpoint GET /api/v1/teacher/students */
  @Get('students')
  students(@CurrentUser() u: AuthUser) { return this.svc.students(u.id) }

  /** @endpoint GET /api/v1/teacher/schedule?status=upcoming|past|pending */
  @Get('schedule')
  schedule(@CurrentUser() u: AuthUser, @Query('status') status?: 'upcoming' | 'past' | 'pending') {
    return this.svc.schedule(u.id, status)
  }

  /** @endpoint GET /api/v1/teacher/students/:id */
  @Get('students/:id')
  studentDetail(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.studentDetail(u.id, id)
  }

  /** @endpoint POST /api/v1/teacher/classes/:classId/notes */
  @Post('classes/:classId/notes')
  addNote(
    @CurrentUser() u: AuthUser,
    @Param('classId') classId: string,
    @Body() body: { rating: number; notes: string },
  ) {
    return this.svc.addNote(u.id, classId, body.rating, body.notes)
  }

  /** @endpoint GET /api/v1/teacher/availability  (self) */
  @Get('availability')
  getAvailability(@CurrentUser() u: AuthUser) {
    return this.scheduling.getTeacherAvailability(u.id)
  }

  /**
   * @endpoint POST /api/v1/teacher/availability  (self)
   * Body: { slots: [{ weekday, startsAt, endsAt }] }
   * Al guardar, se dispara una re-evaluación de estudiantes en
   * `manual_pending`: si el profesor cubre TODOS los bloques del alumno,
   * queda auto-asignado.
   */
  @Post('availability')
  async setAvailability(
    @CurrentUser() u: AuthUser,
    @Body() body: { slots: Array<{ weekday: number; startsAt: string; endsAt: string }> },
  ) {
    const availability = await this.scheduling.setTeacherAvailability(u.id, body.slots ?? [])
    const reassigned = await this.scheduling.reassignPendingForTeacher(u.id)
    return { availability, reassigned }
  }
}
