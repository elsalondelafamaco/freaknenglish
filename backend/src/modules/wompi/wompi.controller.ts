import { Controller, Headers, Post, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { WompiService } from './wompi.service'

@ApiTags('wompi')
@Controller('public/wompi')
export class WompiController {
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
    const raw = Buffer.isBuffer(req.body)
      ? (req.body as Buffer).toString('utf8')
      : JSON.stringify(req.body)
    const event = this.svc.verifyAndParse(raw, eventId)
    return this.svc.handleEvent(event)
  }
}
