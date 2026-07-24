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

  /** @endpoint GET /api/v1/admin/metrics?range=30 */
  @Get('metrics')
  metrics(@Query('range') range?: string) {
    const n = range ? Number(range.replace(/[^0-9]/g, '')) : 30
    return this.svc.metrics(Number.isFinite(n) && n > 0 ? n : 30)
  }

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

  /** @endpoint POST /api/v1/admin/payroll/generate?period=YYYY-MM (persiste PayrollRun) */
  @Post('payroll/generate')
  generatePayroll(@Query('period') period: string) { return this.svc.generatePayrollRuns(period) }

  /** @endpoint GET /api/v1/admin/payroll/runs?period=YYYY-MM */
  @Get('payroll/runs')
  payrollRuns(@Query('period') period: string) { return this.svc.listPayrollRuns(period) }

  /** @endpoint POST /api/v1/admin/payroll/runs/:id/pay (aprueba + paga/dispersa) */
  @Post('payroll/runs/:id/pay')
  payPayrollRun(@Param('id') id: string) { return this.svc.payPayrollRun(id) }

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
  createUser(
    @Body()
    body: {
      email: string
      fullName: string
      role: 'student' | 'teacher'
      level?: 'beginner' | 'intermediate' | 'advanced'
      plan?: { planId: string; endDate: string }
    },
  ) {
    return this.svc.createUser(body)
  }

  /**
   * @endpoint PATCH /api/v1/admin/users/:id/subscription
   * Crea o edita a mano la suscripción de un estudiante (empalme de alumnos
   * que pagaron por fuera de Wompi, extensiones, cortesías).
   * Body: { planId, status?, currentPeriodEnd?: 'YYYY-MM-DD'|ISO|null, startedAt? }
   */
  @Patch('users/:id/subscription')
  setSubscription(
    @Param('id') id: string,
    @Body()
    body: {
      planId: string
      status?: 'pending' | 'active' | 'past_due' | 'canceled' | 'expired'
      currentPeriodEnd?: string | null
      startedAt?: string | null
    },
  ) {
    return this.svc.setUserSubscription(id, body)
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

  // ────────────────────────────────────────────────────────────────────────
  // CRM · detalle y administración de usuarios
  // ────────────────────────────────────────────────────────────────────────

  /**
   * @endpoint GET /api/v1/admin/users/:id
   * Detalle completo del usuario: perfil, suscripción, pagos, clases,
   * progreso de aprendizaje, NPS, notas, estudiantes asignados (si profesor),
   * profesor asignado (si estudiante).
   */
  @Get('users/:id')
  userDetail(@Param('id') id: string) {
    return this.svc.userDetail(id)
  }

  /**
   * @endpoint PATCH /api/v1/admin/users/:id
   * Edita campos básicos (fullName, phone, role, englishLevel).
   */
  @Patch('users/:id')
  updateUser(
    @Param('id') id: string,
    @Body() body: { fullName?: string; phone?: string; role?: 'student' | 'teacher' | 'admin'; englishLevel?: 'beginner' | 'intermediate' | 'advanced' | null },
  ) {
    return this.svc.updateUser(id, body)
  }

  /**
   * @endpoint PATCH /api/v1/admin/users/:id/status
   * Activa/desactiva un usuario. `disabled=true` marca `disabledAt=now()`
   * y bloquea login en `AuthService`.
   */
  @Patch('users/:id/status')
  setUserStatus(@Param('id') id: string, @Body() body: { disabled: boolean }) {
    return this.svc.setUserStatus(id, body.disabled)
  }

  /**
   * @endpoint DELETE /api/v1/admin/users/:id
   * Soft delete: marca `deletedAt=now()`. No borra históricos.
   */
  @Patch('users/:id/delete')
  softDeleteUser(@Param('id') id: string) {
    return this.svc.softDeleteUser(id)
  }

  /**
   * @endpoint POST /api/v1/admin/users/:id/reset-password
   * Genera un token de un solo uso y dispara email (Resend) con el link
   * `${PUBLIC_SITE_URL}/reset-password?token=...`. Devuelve token sólo en dev.
   */
  @Post('users/:id/reset-password')
  resetPassword(@Param('id') id: string) {
    return this.svc.resetUserPassword(id)
  }

  // ────────────────────────────────────────────────────────────────────────
  // Nómina · tarifa por hora configurable
  // ────────────────────────────────────────────────────────────────────────

  /** @endpoint GET /api/v1/admin/settings/payroll */
  @Get('settings/payroll')
  getPayrollSettings() { return this.svc.getPayrollSettings() }

  /** @endpoint PATCH /api/v1/admin/settings/payroll  body: { hourlyRateCop: number } */
  @Patch('settings/payroll')
  setPayrollSettings(@Body() body: { hourlyRateCop: number }) {
    return this.svc.setPayrollSettings(body.hourlyRateCop)
  }

  // ────────────────────────────────────────────────────────────────────────
  // CMS · módulos, lecciones, adjuntos
  // ────────────────────────────────────────────────────────────────────────

  /** @endpoint POST /api/v1/admin/content/modules */
  @Post('content/modules')
  createModule(@Body() body: { id?: string; level: 'beginner' | 'intermediate' | 'advanced'; title: string; summary?: string; position?: number }) {
    return this.svc.saveModule(body)
  }

  /** @endpoint PATCH /api/v1/admin/content/modules/:id */
  @Patch('content/modules/:id')
  updateModule(@Param('id') id: string, @Body() body: { title?: string; summary?: string; level?: 'beginner' | 'intermediate' | 'advanced'; position?: number }) {
    return this.svc.saveModule({ id, ...body } as any)
  }

  /** @endpoint PATCH /api/v1/admin/content/modules/:id/delete */
  @Patch('content/modules/:id/delete')
  deleteModule(@Param('id') id: string) { return this.svc.deleteModule(id) }

  /** @endpoint POST /api/v1/admin/content/lessons */
  @Post('content/lessons')
  createLesson(
    @Body()
    body: {
      moduleId: string
      title: string
      kind?: 'video' | 'pdf' | 'slides' | 'download' | 'html'
      durationMin?: number
      videoUrl?: string
      pdfUrl?: string
      slidesUrl?: string
      contentHtml?: string
      notes?: string
    },
  ) {
    return this.svc.saveLesson(body)
  }

  /** @endpoint PATCH /api/v1/admin/content/lessons/:id */
  @Patch('content/lessons/:id')
  updateLesson(@Param('id') id: string, @Body() body: any) {
    return this.svc.saveLesson({ id, ...body })
  }

  /** @endpoint PATCH /api/v1/admin/content/lessons/:id/delete */
  @Patch('content/lessons/:id/delete')
  deleteLesson(@Param('id') id: string) { return this.svc.deleteLesson(id) }

  /** @endpoint POST /api/v1/admin/content/checkpoints */
  @Post('content/checkpoints')
  createCheckpoint(@Body() body: { id?: string; moduleId: string; fromLevel: 'beginner' | 'intermediate' | 'advanced'; toLevel: 'beginner' | 'intermediate' | 'advanced'; passingScore?: number; questions?: unknown }) {
    return this.svc.saveCheckpoint(body)
  }

  /** @endpoint PATCH /api/v1/admin/content/checkpoints/:id */
  @Patch('content/checkpoints/:id')
  updateCheckpoint(@Param('id') id: string, @Body() body: any) {
    return this.svc.saveCheckpoint({ id, ...body })
  }

  /** @endpoint PATCH /api/v1/admin/content/checkpoints/:id/delete */
  @Patch('content/checkpoints/:id/delete')
  deleteCheckpoint(@Param('id') id: string) { return this.svc.deleteCheckpoint(id) }

  /** @endpoint GET /api/v1/admin/at-risk  (CRM: estudiantes en riesgo de churn) */
  @Get('at-risk')
  atRisk() { return this.svc.atRiskStudents() }

  /** @endpoint GET /api/v1/admin/plans */
  @Get('plans')
  plans() { return this.svc.listPlans() }

  /** @endpoint PATCH /api/v1/admin/plans/:id */
  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Body() body: any) { return this.svc.updatePlan(id, body) }

  /** @endpoint GET /api/v1/admin/settings/contact */
  @Get('settings/contact')
  getContact() { return this.svc.contactSettings() }

  /** @endpoint PATCH /api/v1/admin/settings/contact */
  @Patch('settings/contact')
  setContact(@Body() body: { whatsappNumber?: string; whatsappMessage?: string }) {
    return this.svc.updateContactSettings(body)
  }

  /**
   * @endpoint POST /api/v1/admin/uploads/sign
   * Devuelve una URL firmada para `PUT` a MinIO/S3 + la URL pública final.
   * Body: { filename, contentType?, lessonId? }
   */
  @Post('uploads/sign')
  signUpload(@Body() body: { filename: string; contentType?: string; lessonId?: string }) {
    return this.svc.signUpload(body)
  }

  /** @endpoint POST /api/v1/admin/content/lessons/:id/attachments */
  @Post('content/lessons/:id/attachments')
  attachFile(
    @Param('id') lessonId: string,
    @Body() body: { name: string; storageKey: string; url: string; contentType?: string; sizeBytes?: number },
  ) {
    return this.svc.attachLessonFile(lessonId, body)
  }

  /** @endpoint PATCH /api/v1/admin/content/attachments/:id/delete */
  @Patch('content/attachments/:id/delete')
  deleteAttachment(@Param('id') id: string) {
    return this.svc.deleteAttachment(id)
  }
}
