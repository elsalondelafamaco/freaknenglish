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

  /** @endpoint GET /api/v1/learning/modules?level=beginner */
  @Get('modules')
  modules(@Query('level') level?: 'beginner' | 'intermediate' | 'advanced') {
    return this.svc.listModules(level)
  }

  /** @endpoint GET /api/v1/learning/modules/:id */
  @Get('modules/:id')
  module(@Param('id') id: string) { return this.svc.module(id) }

  /** @endpoint POST /api/v1/learning/progress */
  @Post('progress')
  progress(
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
