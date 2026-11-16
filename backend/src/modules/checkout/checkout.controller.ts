import { Body, Controller, Get, NotFoundException, Param, Post, Query, Req } from '@nestjs/common'
import type { Request } from 'express'
import { ApiTags } from '@nestjs/swagger'
import { SkipThrottle, Throttle } from '@nestjs/throttler'
import { IsArray, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { CheckoutService } from './checkout.service'
import { WompiService } from '../wompi/wompi.service'
import { PagoDirectoService } from './pago-directo.service'
import { MEDIOS_SOPORTADOS, MedioDePago } from '../wompi/wompi-api'
import { PrismaService } from '../../prisma/prisma.service'

/** Con qué enlace llegó quien compra (la guarda el navegador al aterrizar). */
class AtribucionDto {
  @IsOptional() @IsString() @MaxLength(100) promo?: string
  @IsOptional() @IsString() @MaxLength(100) utm_source?: string
  @IsOptional() @IsString() @MaxLength(100) utm_medium?: string
  @IsOptional() @IsString() @MaxLength(100) utm_campaign?: string
  @IsOptional() @IsString() @MaxLength(100) utm_content?: string
}

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
  /** Promo/UTM con los que llegó: el servidor decide si hay descuento, nunca el monto del cliente. */
  @IsOptional() @ValidateNested() @Type(() => AtribucionDto) atribucion?: AtribucionDto
}

/** La llave de acceso al pago: la devuelve `/checkout/intents` y la guarda el navegador. */
class LlaveDto {
  @IsString() @MinLength(20) @MaxLength(100) llave!: string
}

/** Lo que manda el navegador para cobrar dentro del sitio. */
class PagarDto extends LlaveDto {
  @IsIn(MEDIOS_SOPORTADOS as unknown as string[]) metodo!: MedioDePago
  @IsString() @IsOptional() @MaxLength(200) token?: string
  @Type(() => Number) @IsInt() @Min(1) @Max(36) @IsOptional() cuotas?: number
  @IsObject() @IsOptional() browserInfo?: Record<string, unknown>
  @IsString() @IsOptional() @MaxLength(200) sessionId?: string
  @IsString() @IsOptional() @MaxLength(200) deviceId?: string
  @IsString() @IsOptional() @MaxLength(30) telefono?: string
  @IsString() @IsOptional() @MaxLength(10) banco?: string
  @Type(() => Number) @IsIn([0, 1]) @IsOptional() tipoPersona?: number
  @IsString() @IsOptional() @MaxLength(5) tipoDocumento?: string
  @IsString() @IsOptional() @MaxLength(30) documento?: string
}

/**
 * IP para Wompi (antifraude): la del cliente, o nada si es local. Una IP de
 * loopback no le sirve a Wompi y no vale la pena arriesgar un rechazo por ella.
 */
function ipParaWompi(req: Request): string | undefined {
  const ip = ipDelCliente(req)?.replace(/^::ffff:/, '')
  if (!ip || ip === '::1' || ip.startsWith('127.')) return undefined
  return ip
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
  constructor(
    private svc: CheckoutService,
    private prisma: PrismaService,
    private wompi: WompiService,
    private pago: PagoDirectoService,
  ) {}

  /**
   * @endpoint GET /api/v1/checkout/pago/info (public)
   * Cómo se cobra (`direct` o `hosted`) y, en directo, los medios activos, los
   * bancos de PSE, los enlaces de términos y la llave PÚBLICA para tokenizar.
   */
  @Get('pago/info')
  infoDePago() {
    return this.pago.info()
  }

  /**
   * @endpoint POST /api/v1/checkout/pago/:reference (public, con llave)
   * Cobra dentro del sitio. Un cobro en curso bloquea otro: devuelve el que está
   * en curso para retomarlo, con `reanudado: true`.
   */
  // Sin el límite "auth" (20/min por IP, que en throttler v6 cuenta TODA la
  // API): la página ya hizo varias llamadas antes de pagar y el cobro no puede
  // caer en un 429 por eso. Lo protege la llave y su propio tope de 10/min.
  @SkipThrottle({ auth: true })
  @Throttle({ burst: { ttl: 60_000, limit: 10 } })
  @Post('pago/:reference')
  pagar(@Param('reference') reference: string, @Body() dto: PagarDto, @Req() req: Request) {
    const { llave, ...datos } = dto
    return this.pago.pagar(reference, llave, datos, { ip: ipParaWompi(req) })
  }

  /**
   * @endpoint POST /api/v1/checkout/pago/:reference/estado (public, con llave)
   * Estado del pago consultando a Wompi. Es POST para que la llave no quede en
   * la URL ni en los logs de acceso.
   */
  // Se sondea cada 2,5 s mientras se espera a Nequi o al banco: con el límite
  // "auth" (20/min) se cortaba al minuto. Quedan el general y el anti-ráfaga.
  @SkipThrottle({ auth: true })
  @Post('pago/:reference/estado')
  estadoDePago(@Param('reference') reference: string, @Body() dto: LlaveDto) {
    return this.pago.estado(reference, dto.llave)
  }
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
