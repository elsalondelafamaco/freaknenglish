import { Controller, Get, Param, Res } from '@nestjs/common'
import type { Response } from 'express'
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

  /**
   * @endpoint GET /api/v1/public/settings/site
   * Contenido editable de la home (media, FAQs, legal, redes). El storefront
   * lo mezcla sobre sus defaults quemados.
   */
  @Get('site')
  site() { return this.svc.siteContent() }

  /**
   * @endpoint GET /api/v1/public/settings/media/:slot
   * URL ESTABLE de cada imagen de la home. Redirige (302) al objeto actual en
   * MinIO. Así el `<img src>` del sitio nunca cambia: el admin sube una imagen
   * nueva, se reemplaza el objeto detrás y la página sigue apuntando al mismo
   * sitio — sin parpadeo ni swap de URL a mitad de carga.
   * Si el slot no tiene imagen configurada responde 404 y el front usa su
   * imagen por defecto del bundle.
   */
  @Get('media/:slot')
  async media(@Param('slot') slot: string, @Res() res: Response) {
    const url = await this.svc.siteMediaUrl(slot)
    if (!url) {
      res.status(404).json({ message: 'sin imagen configurada para este slot' })
      return
    }
    // Cache corto: si el admin reemplaza la imagen, se ve pronto sin dejar de
    // aprovechar la caché del navegador entre visitas.
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.redirect(302, url)
  }
}
