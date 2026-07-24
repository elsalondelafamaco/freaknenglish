import { Controller, Get } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { AdminService } from './admin.service'

/** Ajustes públicos (sin auth) — p.ej. contacto de WhatsApp para el sitio. */
@ApiTags('public')
@Controller('public/settings')
export class PublicSettingsController {
  constructor(private svc: AdminService) {}

  /** @endpoint GET /api/v1/public/settings */
  @Get()
  contact() { return this.svc.contactSettings() }
}
