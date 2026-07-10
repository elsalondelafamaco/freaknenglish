import { Body, Controller, Get, Header, Param, Patch, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator'
import { UsersService } from './users.service'
import { PrismaService } from '../../prisma/prisma.service'
import { ReceiptsService } from './receipts.service'

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class UsersController {
  constructor(
    private users: UsersService,
    private prisma: PrismaService,
    private receipts: ReceiptsService,
  ) {}

  /** @endpoint GET /api/v1/me */
  @Get()
  me(@CurrentUser() user: AuthUser) { return this.users.me(user.id) }

  /** @endpoint PATCH /api/v1/me */
  @Patch()
  update(
    @CurrentUser() user: AuthUser,
    @Body() body: { fullName?: string; phone?: string; avatarUrl?: string; documentNumber?: string },
  ) {
    return this.users.update(user.id, body)
  }

  /**
   * @endpoint GET /api/v1/me/payments
   * Histórico de intents del usuario (incluye los que fueron creados por
   * email antes de existir el `userId`, matcheados por customerEmail).
   */
  @Get('payments')
  async payments(@CurrentUser() user: AuthUser) {
    const me = await this.prisma.user.findUnique({ where: { id: user.id } })
    const intents = await this.prisma.paymentIntent.findMany({
      where: {
        OR: [{ userId: user.id }, { customerEmail: me?.email ?? '' }],
      },
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { name: true, id: true } } },
      take: 50,
    })
    return intents.map((i) => ({
      id: i.id,
      reference: i.reference,
      planId: i.planId,
      planName: i.plan?.name,
      amountInCents: i.amountInCents,
      currency: i.currency,
      status: i.status,
      approvedAt: i.approvedAt,
      createdAt: i.createdAt,
      wompiId: i.wompiId,
    }))
  }

  /**
   * @endpoint GET /api/v1/me/payments/:intentId/receipt.pdf
   * PDF de recibo (branding por env). Sólo el dueño del intent puede descargarlo.
   */
  @Get('payments/:intentId/receipt.pdf')
  @Header('Content-Type', 'application/pdf')
  async receipt(
    @CurrentUser() user: AuthUser,
    @Param('intentId') intentId: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const me = await this.prisma.user.findUnique({ where: { id: user.id } })
    const buf = await this.receipts.pdfBufferForOwner(intentId, user.id, me?.email ?? '')
    res.setHeader('Content-Disposition', `attachment; filename="recibo-${intentId}.pdf"`)
    res.setHeader('Content-Length', String(buf.length))
    res.end(buf)
  }
}
