import { Controller, Get } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { PrismaService } from '../../prisma/prisma.service'
import { ExchangeService } from '../exchange/exchange.service'

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private prisma: PrismaService, private exchange: ExchangeService) {}
  /** @endpoint GET /api/v1/plans  (public) */
  @Get()
  async list() {
    const [plans, trm] = await Promise.all([
      this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { daysPerWeek: 'asc' } }),
      this.exchange.getCurrentTrm(),
    ])
    return {
      trm: { valueCop: trm.valueCop, validFrom: trm.validFrom, source: trm.source },
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        daysPerWeek: p.daysPerWeek,
        priceCop: p.priceCop,
        priceUsd: p.priceUsd,
        features: p.features,
      })),
    }
  }
}
