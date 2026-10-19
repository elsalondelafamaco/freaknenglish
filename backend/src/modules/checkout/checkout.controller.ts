import { Body, Controller, Get, NotFoundException, Post, Query, Req } from '@nestjs/common'
import type { Request } from 'express'
import { ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
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
  /** Zona IANA del navegador de quien compra, p. ej. "Europe/Madrid". */
  @IsString() @IsOptional() timezone?: string
  @IsArray() @IsOptional() slots?: Array<{ weekday: number; hour: number }>
  /** Cookies del píxel de Meta, para atribuir la compra al anuncio. */
  @IsString() @IsOptional() fbp?: string
  @IsString() @IsOptional() fbc?: string
  /** Página desde la que se inició el pago. */
  @IsString() @IsOptional() eventSourceUrl?: string
}

/**
 * IP real de quien compra. El sitio va detrás de Cloudflare y de Railway, así
 * que la del socket es la de un proxy: se toma la que Cloudflare dice que vio, y
 * si no está, la primera de la cadena `x-forwarded-for`.
 */
function ipDelCliente(req: Request): string | undefined {
  const cf = req.headers['cf-connecting-ip']
  if (typeof cf === 'string' && cf.trim()) return cf.trim()
  const xff = req.headers['x-forwarded-for']
  const primera = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim()
  return primera || req.socket?.remoteAddress || undefined
}

@ApiTags('checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private svc: CheckoutService, private prisma: PrismaService, private wompi: WompiService) {}
  /**
   * @endpoint POST /api/v1/checkout/intents (public)
   * Endpoint público que crea registros y puede crear usuarios: se limita para
   * que nadie llene la base de intentos basura desde un script.
   */
  @Throttle({ burst: { ttl: 60_000, limit: 10 } })
  @Post('intents')
  create(@Body() dto: CreateIntentDto, @Req() req: Request) {
    const ua = req.headers['user-agent']
    return this.svc.createIntent({
      ...dto,
      clientIp: ipDelCliente(req),
      clientUserAgent: typeof ua === 'string' ? ua : undefined,
    })
  }

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
        amountInCents: null,
        currency: null,
        esRenovacion: false,
      }
    }
    return {
      reference: intent.reference,
      status: intent.status,
      planId: intent.planId,
      planName: intent.plan?.name,
      approvedAt: intent.approvedAt,
      customerEmail: intent.customerEmail,
      // Lo cobrado de verdad (USD × TRM del momento), para que el píxel del
      // navegador reporte la compra con el mismo valor que el servidor.
      amountInCents: intent.amountInCents,
      currency: intent.currency,
      esRenovacion: intent.esRenovacion,
    }
  }
}
