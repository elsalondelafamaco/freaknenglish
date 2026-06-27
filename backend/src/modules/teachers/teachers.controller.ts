import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { TeachersService } from './teachers.service'

@ApiTags('teachers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher', 'admin')
@Controller('teacher')
export class TeachersController {
  constructor(private svc: TeachersService) {}

  /** @endpoint GET /api/v1/teacher/students */
  @Get('students')
  students(@CurrentUser() u: AuthUser) { return this.svc.students(u.id) }

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
}
