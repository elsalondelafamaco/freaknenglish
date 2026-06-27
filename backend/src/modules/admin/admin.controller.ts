import { Body, Controller, Get, Header, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { AdminService } from './admin.service'

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private svc: AdminService) {}

  /** @endpoint GET /api/v1/admin/analytics */
  @Get('analytics')
  analytics() { return this.svc.analytics() }

  /** @endpoint GET /api/v1/admin/users?q=foo */
  @Get('users')
  users(@Query('q') q?: string) { return this.svc.users(q) }

  /** @endpoint GET /api/v1/admin/payroll?period=YYYY-MM */
  @Get('payroll')
  payroll(@Query('period') period: string) { return this.svc.payroll(period) }

  /** @endpoint GET /api/v1/admin/payroll/export.csv?period=YYYY-MM */
  @Get('payroll/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async payrollCsv(@Query('period') period: string, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Content-Disposition', `attachment; filename="payroll-${period}.csv"`)
    return this.svc.payrollCsv(period)
  }

  /** @endpoint GET /api/v1/admin/content  (CMS read-only: modules + lessons) */
  @Get('content')
  content() { return this.svc.content() }

  /** @endpoint GET /api/v1/admin/notifications?status=queued|sent|failed */
  @Get('notifications')
  notifications(@Query('status') status?: 'queued' | 'sent' | 'failed') {
    return this.svc.notifications(status)
  }

  /** @endpoint POST /api/v1/admin/notifications/run  (manual automations trigger) */
  @Post('notifications/run')
  runAutomations() { return this.svc.runAutomationsManually() }

  /**
   * @endpoint GET /api/v1/admin/surveys
   * Lista de encuestas con datos del estudiante. Sólo admin (los profesores
   * NO tienen acceso a esta ruta — protegida por RolesGuard("admin")).
   */
  @Get('surveys')
  surveys(@Query('filter') filter?: 'promoters' | 'detractors' | 'all') {
    return this.svc.surveys(filter)
  }

  /**
   * @endpoint POST /api/v1/admin/users
   * Crea un usuario (estudiante o profesor) sin suscripción asociada.
   * Envía email transaccional con link para configurar contraseña.
   * Body: { email, fullName, role: 'student'|'teacher', level? }
   */
  @Post('users')
  createUser(@Body() body: { email: string; fullName: string; role: 'student' | 'teacher'; level?: 'beginner' | 'intermediate' | 'advanced' }) {
    return this.svc.createUser(body)
  }

  /**
   * @endpoint PATCH /api/v1/admin/users/:id/assign-teacher
   * Asigna (o quita) un profesor a un estudiante.
   * Body: { teacherId: string | null }
   */
  @Patch('users/:id/assign-teacher')
  assignTeacher(@Param('id') studentId: string, @Body() body: { teacherId: string | null }) {
    return this.svc.assignTeacher(studentId, body.teacherId)
  }

  /**
   * @endpoint POST /api/v1/admin/users/:id/impersonate
   * Devuelve un accessToken corto firmado con `actAs=:id` y el JTI del admin
   * original. El frontend persiste el banner y permite restaurar la sesión.
   * Auditoría: inserta en `impersonation_logs`.
   */
  @Post('users/:id/impersonate')
  impersonate(@Param('id') targetId: string, @Req() req: any) {
    return this.svc.impersonate(req.user.id, targetId)
  }
}
