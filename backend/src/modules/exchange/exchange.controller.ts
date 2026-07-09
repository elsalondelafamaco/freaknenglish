import { Controller, Get } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ExchangeService } from './exchange.service'

@ApiTags('exchange')
@Controller('public/exchange')
export class ExchangeController {
  constructor(private svc: ExchangeService) {}
  /** @endpoint GET /api/v1/public/exchange/trm  (public) */
  @Get('trm')
  trm() { return this.svc.getCurrentTrm() }
}