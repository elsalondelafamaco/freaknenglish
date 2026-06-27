import { Controller, Get } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { PrismaService } from '../../prisma/prisma.service'

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private prisma: PrismaService) {}
  /** @endpoint GET /api/v1/plans  (public) */
  @Get()
  list() {
    return this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { daysPerWeek: 'asc' } })
  }
}
