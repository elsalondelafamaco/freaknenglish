import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { LearningService } from './learning.service'

@ApiTags('learning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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

  /** @endpoint GET /api/v1/learning/modules/:id */
  @Get('modules/:id')
  module(@Param('id') id: string) { return this.svc.module(id) }

  /** @endpoint GET /api/v1/learning/progress  (current user, all levels) */
  @Get('progress')
  getProgress(@CurrentUser() u: AuthUser) { return this.svc.userProgress(u.id) }

  /** @endpoint GET /api/v1/learning/checkpoints/:id */
  @Get('checkpoints/:id')
  checkpoint(@Param('id') id: string) { return this.svc.checkpoint(id) }

  /** @endpoint POST /api/v1/learning/progress */
  @Post('progress')
  upsertProgress(
    @CurrentUser() u: AuthUser,
    @Body() body: { lessonId: string; secondsWatched: number; completed: boolean },
  ) {
    return this.svc.upsertProgress(u.id, body.lessonId, body.secondsWatched, body.completed)
  }

  /** @endpoint POST /api/v1/learning/checkpoints/:id/submit */
  @Post('checkpoints/:id/submit')
  submitCheckpoint(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() body: { answers: Record<string, number> },
  ) {
    return this.svc.submitCheckpoint(u.id, id, body.answers)
  }
}
