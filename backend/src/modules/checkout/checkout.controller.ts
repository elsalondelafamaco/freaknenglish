import { Body, Controller, Get, NotFoundException, Post, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { IsArray, IsEmail, IsOptional, IsString, MinLength } from 'class-validator'
import { CheckoutService } from './checkout.service'
import { WompiService } from '../wompi/wompi.service'
import { PrismaService } from '../../prisma/prisma.service'

class CreateIntentDto {
  @IsString() planId!: string
  @IsEmail() customerEmail!: string
  @IsString() @MinLength(2) customerName!: string
  @IsString() @MinLength(6) customerPhone!: string
  @IsString() @MinLength(4) customerDocument!: string
  @IsString() @IsOptional() userId?: string
  @IsString() @MinLength(8) @IsOptional() password?: string
  @IsArray() @IsOptional() slots?: Array<{ weekday: number; hour: number }>
}

@ApiTags('checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private svc: CheckoutService, private prisma: PrismaService, private wompi: WompiService) {}
  /** @endpoint POST /api/v1/checkout/intents (public) */
  @Post('intents')
  create(@Body() dto: CreateIntentDto) { return this.svc.createIntent(dto) }

  /** @endpoint GET /api/v1/checkout/status?reference=... (public) */
  @Get('status')
  async status(@Query('reference') reference?: string, @Query('id') wompiId?: string) {
    if (!reference && !wompiId) throw new NotFoundException('reference or id required')
    // Poll con id de Wompi: verifica contra Wompi y finaliza idempotentemente
    // (funciona aunque el webhook aún no haya llegado). Resuelve la referencia.
    if (wompiId) {
      const r = await this.wompi.finalizeByWompiId(wompiId)
      if (r.reference) reference = r.reference
    }
    const intent = await this.prisma.paymentIntent.findFirst({
      where: reference ? { reference } : { wompiId },
      include: { plan: true },
    })
    if (!intent) {
      // Todavía sin registro (Wompi aún no expone la tx): el front sigue polleando.
      return {
        reference: reference ?? null,
        status: 'PENDING' as const,
        planId: null,
        planName: null,
        approvedAt: null,
        customerEmail: null,
      }
    }
    return {
      reference: intent.reference,
      status: intent.status,
      planId: intent.planId,
      planName: intent.plan?.name,
      approvedAt: intent.approvedAt,
      customerEmail: intent.customerEmail,
    }
  }
}
