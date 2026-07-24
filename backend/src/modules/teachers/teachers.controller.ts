import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards, Patch } from '@nestjs/common'
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
    return this.svc.studentDetail(u.id, id, u.role === 'admin')
  }

  /** @endpoint POST /api/v1/teacher/classes/:classId/notes */
  @Post('classes/:classId/notes')
  addNote(
    @CurrentUser() u: AuthUser,
    @Param('classId') classId: string,
    @Body() body: { notes: string },
  ) {
    return this.svc.addNote(u.id, classId, body.notes, u.role === 'admin')
  }

  /** @endpoint PATCH /api/v1/teacher/notes/:id/pin  Body: { pinned } */
  @Patch('notes/:id/pin')
  pinNote(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: { pinned: boolean }) {
    return this.svc.togglePin(u.id, id, !!body.pinned, u.role === 'admin')
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

  /** @endpoint GET /api/v1/teacher/absences (self) */
  @Get('absences')
  getAbsences(@CurrentUser() u: AuthUser) { return this.svc.listAbsences(u.id) }

  /** @endpoint POST /api/v1/teacher/absences (self) Body: { startsAt, endsAt, reason? } */
  @Post('absences')
  createAbsence(@CurrentUser() u: AuthUser, @Body() body: { startsAt: string; endsAt: string; reason?: string }) {
    return this.svc.createAbsence(u.id, new Date(body.startsAt), new Date(body.endsAt), body.reason)
  }

  /** @endpoint DELETE /api/v1/teacher/absences/:id (self) */
  @Delete('absences/:id')
  deleteAbsence(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.deleteAbsence(u.id, id)
  }
}
