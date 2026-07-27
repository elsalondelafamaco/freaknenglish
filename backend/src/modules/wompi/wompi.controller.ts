import { Controller, Headers, Logger, Post, Req } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { WompiService } from './wompi.service'

@ApiTags('wompi')
// Dos prefijos para el MISMO handler:
//   · public/wompi/webhook   → canónico
//   · checkout/wompi/webhook → alias que quedó configurado en el panel de Wompi
// Así el evento entra por cualquiera de los dos y no se pierde un pago por una
// URL desactualizada. El body crudo de ambas rutas se registra en main.ts.
// Sin rate limit: los reintentos legítimos de Wompi ante un pico de pagos no
// pueden rebotar contra el límite global. La autenticidad ya la garantiza la
// firma HMAC del evento, y el tamaño del body está acotado en el handler.
@SkipThrottle()
@Controller(['public/wompi', 'checkout/wompi'])
export class WompiController {
  private readonly log = new Logger(WompiController.name)
  constructor(private svc: WompiService) {}

  /**
   * @endpoint POST /api/v1/public/wompi/webhook
   * @endpoint POST /api/v1/checkout/wompi/webhook  (alias)
   * Public (no auth). Caller must be Wompi — verified by HMAC over raw body.
   */
  @Post('webhook')
  async webhook(@Req() req: Request, @Headers('x-event-id') eventId?: string) {
    // Body arrives as Buffer thanks to express.raw() bound in main.ts.
    const isBuf = Buffer.isBuffer(req.body)
    const raw = isBuf ? (req.body as Buffer).toString('utf8') : JSON.stringify(req.body)
    this.log.log(
      `[webhook] POST ${req.originalUrl} — eventId=${eventId ?? '-'} rawBuffer=${isBuf} len=${raw?.length ?? 0}`,
    )
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
