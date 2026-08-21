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

  /** @endpoint GET /api/v1/teacher/schedule?status=upcoming|past|pending|frozen */
  @Get('schedule')
  schedule(
    @CurrentUser() u: AuthUser,
    @Query('status') status?: 'upcoming' | 'past' | 'pending' | 'frozen',
  ) {
    return this.svc.schedule(u.id, status)
  }

  /** @endpoint GET /api/v1/teacher/students/:id */
  @Get('students/:id')
  studentDetail(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.studentDetail(u.id, id, u.role === 'admin')
  }

  /** @endpoint GET /api/v1/teacher/students/:id/activity-results */
  @Get('students/:id/activity-results')
  studentActivityResults(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.studentActivityResults(u.id, id, u.role === 'admin')
  }

  /** @endpoint GET /api/v1/teacher/students/:id/checkpoint-gates  (estado de compuertas) */
  @Get('students/:id/checkpoint-gates')
  checkpointGates(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.checkpointGates(u.id, id, u.role === 'admin')
  }

  /**
   * @endpoint POST /api/v1/teacher/students/:id/checkpoint-gates/:lessonId
   * Body: { unlock: boolean, note?: string } — habilita o revoca el checkpoint.
   */
  @Post('students/:id/checkpoint-gates/:lessonId')
  setCheckpointGate(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
    @Body() body: { unlock: boolean; note?: string },
  ) {
    return this.svc.setCheckpointGate(u.id, id, lessonId, !!body?.unlock, body?.note, u.role === 'admin')
  }

  /** @endpoint GET /api/v1/teacher/students/:id/lesson-plan  (qué tiene habilitado) */
  @Get('students/:id/lesson-plan')
  lessonPlan(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.lessonPlan(u.id, id, u.role === 'admin')
  }

  /**
   * @endpoint POST /api/v1/teacher/students/:id/lesson-unlocks
   * Body: { lessonIds: string[], unlock: boolean } — habilita/revoca en lote.
   */
  @Post('students/:id/lesson-unlocks')
  setLessonUnlocks(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() body: { lessonIds: string[]; unlock: boolean },
  ) {
    return this.svc.setLessonUnlocks(u.id, id, body?.lessonIds ?? [], !!body?.unlock, u.role === 'admin')
  }

  /** @endpoint GET /api/v1/teacher/students/:id/checkpoint-attempts */
  @Get('students/:id/checkpoint-attempts')
  studentCheckpointAttempts(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.studentCheckpointAttempts(u.id, id, u.role === 'admin')
  }

  /** @endpoint PATCH /api/v1/teacher/students/:id/meeting-url  Body: { url } */
  @Patch('students/:id/meeting-url')
  setMeetingUrl(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() body: { url?: string | null },
  ) {
    return this.svc.setStudentMeetingUrl(u.id, id, body?.url ?? null, u.role === 'admin')
  }

  /** @endpoint POST /api/v1/teacher/students/:studentId/notes  (sin requerir clases) */
  @Post('students/:studentId/notes')
  addStudentNote(
    @CurrentUser() u: AuthUser,
    @Param('studentId') studentId: string,
    @Body() body: { notes: string },
  ) {
    return this.svc.addStudentNote(u.id, studentId, body.notes, u.role === 'admin')
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
   * @endpoint GET /api/v1/teacher/occupied-slots  (self)
   * Franjas semanales que el profesor ya tiene con estudiantes, expandidas
   * según la duración de cada clase. El editor de disponibilidad las marca
   * para que no se despinte por error una hora que tiene clase.
   */
  @Get('occupied-slots')
  occupiedSlots(@CurrentUser() u: AuthUser) {
    return this.svc.myOccupiedSlots(u.id)
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

  /** @endpoint GET /api/v1/teacher/calendar?from=ISO&to=ISO */
  @Get('calendar')
  calendar(@CurrentUser() u: AuthUser, @Query('from') from: string, @Query('to') to: string) {
    return this.svc.calendar(u.id, new Date(from), new Date(to))
  }

  /** @endpoint POST /api/v1/teacher/classes/:id/reschedule  Body: { startsAt, scope: 'once'|'forever' } */
  @Post('classes/:id/reschedule')
  rescheduleClass(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() body: { startsAt: string; scope: 'once' | 'forever' },
  ) {
    return this.svc.rescheduleClass(u.id, id, new Date(body.startsAt), body.scope === 'forever' ? 'forever' : 'once')
  }

  /** @endpoint GET /api/v1/teacher/absences (self) */
  @Get('absences')
  getAbsences(@CurrentUser() u: AuthUser) { return this.svc.listAbsences(u.id) }

  /** @endpoint POST /api/v1/teacher/absences (self) Body: { startsAt, endsAt, reason? } */
  @Post('absences')
  createAbsence(@CurrentUser() u: AuthUser, @Body() body: { startsAt: string; endsAt: string; reason?: string }) {
    return this.svc.createAbsence(u.id, new Date(body.startsAt), new Date(body.endsAt), body.reason)
  }

  /** @endpoint POST /api/v1/teacher/absences/by-classes  Body: { classIds[], reason? } */
  @Post('absences/by-classes')
  createAbsencesByClasses(@CurrentUser() u: AuthUser, @Body() body: { classIds: string[]; reason?: string }) {
    return this.svc.createAbsencesForClasses(u.id, body?.classIds ?? [], body?.reason)
  }

  /** @endpoint DELETE /api/v1/teacher/absences/:id (self) */
  @Delete('absences/:id')
  deleteAbsence(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.deleteAbsence(u.id, id)
  }

  /**
   * @endpoint GET /api/v1/teacher/resources
   * Material extra: HTMLs de apoyo que sube el admin. Sin `contentHtml` para
   * no traer todo el material en cada carga del listado.
   */
  @Get('resources')
  resources(@Query('level') level?: string) { return this.svc.listResources(level) }

  /** @endpoint GET /api/v1/teacher/resources/:id (con el HTML completo) */
  @Get('resources/:id')
  resource(@Param('id') id: string) { return this.svc.getResource(id) }

  // ── Material para un estudiante concreto ─────────────────────────────────

  /**
   * @endpoint POST /api/v1/teacher/students/:studentId/uploads/sign
   * Firma la subida de un archivo (PDF) para ese estudiante.
   */
  @Post('students/:studentId/uploads/sign')
  signStudentUpload(
    @CurrentUser() u: AuthUser,
    @Param('studentId') studentId: string,
    @Body() body: { filename: string; contentType: string },
  ) {
    return this.svc.signStudentUpload(u.id, studentId, body?.filename, body?.contentType, u.role === 'admin')
  }

  /** @endpoint GET /api/v1/teacher/students/:studentId/resources */
  @Get('students/:studentId/resources')
  studentResources(@CurrentUser() u: AuthUser, @Param('studentId') studentId: string) {
    return this.svc.listStudentResources(u.id, studentId, u.role === 'admin')
  }

  /**
   * @endpoint POST /api/v1/teacher/student-resources
   * Crea el material para uno o varios estudiantes a la vez.
   */
  @Post('student-resources')
  createStudentResources(
    @CurrentUser() u: AuthUser,
    @Body()
    body: {
      studentIds: string[]
      kind: 'link' | 'file'
      title: string
      description?: string | null
      url: string
      storageKey?: string | null
      contentType?: string | null
      sizeBytes?: number | null
    },
  ) {
    return this.svc.createStudentResources(u.id, body, u.role === 'admin')
  }

  /** @endpoint DELETE /api/v1/teacher/student-resources/:id */
  @Delete('student-resources/:id')
  deleteStudentResource(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.deleteStudentResource(u.id, id, u.role === 'admin')
  }

  // ── Reportes de progreso ─────────────────────────────────────────────────

  /** @endpoint GET /api/v1/teacher/students/:studentId/reports */
  @Get('students/:studentId/reports')
  studentReports(@CurrentUser() u: AuthUser, @Param('studentId') studentId: string) {
    return this.svc.listStudentReports(u.id, studentId, u.role === 'admin')
  }

  /**
   * @endpoint GET /api/v1/teacher/students/:studentId/report-draft?from&to
   * Precarga: nivel y clases tomadas/programadas del periodo.
   */
  @Get('students/:studentId/report-draft')
  reportDraft(
    @CurrentUser() u: AuthUser,
    @Param('studentId') studentId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.svc.reportDraft(u.id, studentId, new Date(from), new Date(to), u.role === 'admin')
  }

  /**
   * @endpoint POST /api/v1/teacher/reports
   * Crea o edita un reporte. Con `publish: true` lo publica y avisa al alumno.
   */
  @Post('reports')
  saveReport(
    @CurrentUser() u: AuthUser,
    @Body()
    body: {
      id?: string
      studentId: string
      periodLabel: string
      level?: 'beginner' | 'intermediate' | 'advanced' | null
      classesTaken?: number | null
      classesTotal?: number | null
      strengths?: string | null
      improvements?: string | null
      recommendation?: string | null
      comment?: string | null
      publish?: boolean
    },
  ) {
    return this.svc.saveStudentReport(u.id, body, u.role === 'admin')
  }
}
