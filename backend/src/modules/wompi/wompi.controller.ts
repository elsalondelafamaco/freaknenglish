import { Controller, Headers, Logger, Post, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { WompiService } from './wompi.service'

@ApiTags('wompi')
@Controller('public/wompi')
export class WompiController {
  private readonly log = new Logger(WompiController.name)
  constructor(private svc: WompiService) {}

  /**
   * @endpoint POST /api/v1/public/wompi/webhook
   * Public (no auth). Caller must be Wompi — verified by HMAC over raw body.
   * NOTE: configure raw body in main.ts middleware if using express.raw, or
   * trust request body shape here. We re-stringify to compute the digest.
   */
  @Post('webhook')
  async webhook(@Req() req: Request, @Headers('x-event-id') eventId?: string) {
    // Body arrives as Buffer thanks to express.raw() bound in main.ts.
    const isBuf = Buffer.isBuffer(req.body)
    const raw = isBuf ? (req.body as Buffer).toString('utf8') : JSON.stringify(req.body)
    this.log.log(`[webhook] POST recibido: eventId=${eventId ?? '-'} rawBuffer=${isBuf} len=${raw?.length ?? 0}`)
    try {
      const event = this.svc.verifyAndParse(raw, eventId)
      const result = await this.svc.handleEvent(event)
      this.log.log(`[webhook] procesado OK: ${JSON.stringify(result)}`)
      return result
    } catch (e) {
      // Log con datos para diagnosticar en Railway; re-lanzamos para que
      // Wompi reciba el error y reintente si aplica.
      this.log.error(`[webhook] ERROR: ${(e as Error).message} — body[0..500]=${raw?.slice(0, 500)}`)
      throw e
    }
  }
}
