import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { ActiveSubscriptionGuard } from '../../common/guards/active-subscription.guard'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { LearningService } from './learning.service'

@ApiTags('learning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
@Controller('learning')
export class LearningController {
  constructor(private svc: LearningService) {}

  /**
   * @endpoint GET /api/v1/learning/modules?level=beginner
   * Si no se pasa `level`, el servicio lo resuelve desde el
   * `englishLevel` del estudiante autenticado (fallback a todos los
   * niveles si el usuario no tiene nivel asignado — admin/teacher).
   */
  @Get('modules')
  modules(
    @CurrentUser() u: AuthUser,
    @Query('level') level?: 'beginner' | 'intermediate' | 'advanced',
  ) {
    return this.svc.listModulesForUser(u.id, level)
  }

  /** @endpoint GET /api/v1/learning/modules/:id  (con compuertas del alumno) */
  @Get('modules/:id')
  module(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.module(id, u.id) }

  /**
   * @endpoint POST /api/v1/learning/lessons/:lessonId/activity-result
   * Guarda el resultado reportado por el bridge FreaknActivity de la lección.
   */
  @Post('lessons/:lessonId/activity-result')
  saveActivityResult(
    @CurrentUser() u: AuthUser,
    @Param('lessonId') lessonId: string,
    @Body()
    body: {
      activityId: string
      title?: string
      score?: number
      maxScore?: number
      answers?: unknown[]
      studentId?: string
      nuevaCorrida?: boolean
    },
  ) {
    return this.svc.saveActivityResult(u.id, u.roles, lessonId, body)
  }

  /**
   * @endpoint GET /api/v1/learning/lessons/:lessonId/slide?studentId=
   * Slide donde quedó la última clase. `studentId` lo manda el profe (o admin)
   * cuando abre la lección para dársela a ese estudiante; el alumno en su
   * propio portal no retoma — empieza siempre por el principio.
   */
  @Get('lessons/:lessonId/slide')
  getSlide(
    @CurrentUser() u: AuthUser,
    @Param('lessonId') lessonId: string,
    @Query('studentId') studentId?: string,
  ) {
    return this.svc.getLastSlide(u.id, u.roles, lessonId, studentId)
  }

  /** @endpoint POST /api/v1/learning/lessons/:lessonId/slide  (`slide: null` la borra) */
  @Post('lessons/:lessonId/slide')
  setSlide(
    @CurrentUser() u: AuthUser,
    @Param('lessonId') lessonId: string,
    @Body() body: { slide: string | number | null; studentId?: string },
  ) {
    return this.svc.setLastSlide(u.id, u.roles, lessonId, body?.slide ?? null, body?.studentId)
  }

  /** @endpoint GET /api/v1/learning/my/activity-results?lessonId= */
  @Get('my/activity-results')
  myActivityResults(@CurrentUser() u: AuthUser, @Query('lessonId') lessonId?: string) {
    return this.svc.myActivityResults(u.id, lessonId || undefined)
  }

  /**
   * @endpoint GET /api/v1/learning/my/resources
   * Material (links y PDFs) que su profesor le dejó a este estudiante.
   */
  @Get('my/resources')
  myResources(@CurrentUser() u: AuthUser) {
    return this.svc.myStudentResources(u.id)
  }

  /** @endpoint GET /api/v1/learning/my/reports  (sólo los publicados) */
  @Get('my/reports')
  myReports(@CurrentUser() u: AuthUser) {
    return this.svc.myReports(u.id)
  }

  /** @endpoint GET /api/v1/learning/my/reports/:id */
  @Get('my/reports/:id')
  myReport(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.myReport(u.id, id)
  }

  /** @endpoint GET /api/v1/learning/progress  (current user, all levels) */
  @Get('progress')
  getProgress(@CurrentUser() u: AuthUser) { return this.svc.userProgress(u.id) }

  /** @endpoint GET /api/v1/learning/checkpoints/:id  (sanitizado + estado de intentos) */
  @Get('checkpoints/:id')
  checkpoint(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.checkpoint(id, u.id) }

  /** @endpoint GET /api/v1/learning/level-checkpoint?level=beginner */
  @Get('level-checkpoint')
  levelCheckpoint(@CurrentUser() u: AuthUser, @Query('level') level: 'beginner' | 'intermediate' | 'advanced') {
    return this.svc.levelCheckpoint(level, u.id)
  }

  /** @endpoint POST /api/v1/learning/progress */
  @Post('progress')
  upsertProgress(
    @CurrentUser() u: AuthUser,
    @Body() body: { lessonId: string; secondsWatched: number; completed: boolean },
  ) {
    return this.svc.upsertProgress(u.id, body.lessonId, body.secondsWatched, body.completed)
  }

  /**
   * @endpoint POST /api/v1/learning/checkpoints/:id/submit
   * Respuestas por tipo: single=índice|string, multi=array, truefalse=bool,
   * fill=string, order/match/dragwords=array de strings.
   */
  @Post('checkpoints/:id/submit')
  submitCheckpoint(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() body: { answers: Record<string, unknown> },
  ) {
    return this.svc.submitCheckpoint(u.id, id, body?.answers ?? {})
  }
}
