import { Controller, Get } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { PrismaService } from '../../prisma/prisma.service'

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}
  /** @endpoint GET /api/v1/health */
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`
    return { ok: true, time: new Date().toISOString() }
  }
}
