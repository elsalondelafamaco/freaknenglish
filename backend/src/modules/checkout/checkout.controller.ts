import { Body, Controller, Get, NotFoundException, Post, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator'
import { CheckoutService } from './checkout.service'
import { PrismaService } from '../../prisma/prisma.service'

class CreateIntentDto {
  @IsString() planId!: string
  @IsEmail() customerEmail!: string
  @IsString() @MinLength(2) customerName!: string
  @IsString() @MinLength(6) customerPhone!: string
  @IsString() @MinLength(4) customerDocument!: string
  @IsString() @IsOptional() userId?: string
}

@ApiTags('checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private svc: CheckoutService, private prisma: PrismaService) {}
  /** @endpoint POST /api/v1/checkout/intents (public) */
  @Post('intents')
  create(@Body() dto: CreateIntentDto) { return this.svc.createIntent(dto) }

  /** @endpoint GET /api/v1/checkout/status?reference=... (public) */
  @Get('status')
  async status(@Query('reference') reference?: string, @Query('id') wompiId?: string) {
    if (!reference && !wompiId) throw new NotFoundException('reference or id required')
    const intent = await this.prisma.paymentIntent.findFirst({
      where: reference ? { reference } : { wompiId },
      include: { plan: true },
    })
    if (!intent) throw new NotFoundException('intent not found')
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
