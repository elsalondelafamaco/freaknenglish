import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import * as crypto from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { env } from '../../config/env'
import { ExchangeService } from '../exchange/exchange.service'
import { SlotsService, SlotRef, PENDING_HOLD_MINUTES } from '../scheduling/slots.service'

@Injectable()
export class CheckoutService {
  constructor(private prisma: PrismaService, private exchange: ExchangeService, private slots: SlotsService) {}

  /**
   * Creates a PaymentIntent and returns the payload the Wompi Checkout Widget needs.
   * Wompi integrity signature spec: SHA256(reference + amountInCents + currency + WOMPI_INTEGRITY_SECRET)
   * https://docs.wompi.co/docs/colombia/widget-checkout-web/#firma-de-integridad
   */
  async createIntent(input: {
    planId: string
    customerEmail: string
    customerName: string
    customerPhone: string
    customerDocument: string
    userId?: string
    slots?: SlotRef[]
  }) {
    const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } })
    if (!plan) throw new NotFoundException('Plan not found')

    const reference = `FREAKN-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    // El precio del plan está en USD; el cobro a Wompi es en COP convertido con
    // la TRM (COP/USD) en tiempo real en este instante. Fallback a priceCop.
    let amountCop = plan.priceCop
    if (plan.priceUsd && plan.priceUsd > 0) {
      const trm = await this.exchange.getCurrentTrm()
      amountCop = Math.round(plan.priceUsd * trm.valueCop)
    }
    const amountInCents = amountCop * 100
    const currency = 'COP'

    // ¿Comprador con suscripción activa? Solo se permite renovación anticipada
    // (últimos 5 días del período) — el nuevo mes se CONCATENA al actual.
    const buyer = input.userId
      ? await this.prisma.user.findUnique({ where: { id: input.userId }, include: { subscription: true } })
      : await this.prisma.user.findFirst({
          where: { email: input.customerEmail.trim().toLowerCase() },
          include: { subscription: true },
        })
    const sub = buyer?.subscription
    if (sub?.status === 'active' && sub.currentPeriodEnd) {
      const msLeft = sub.currentPeriodEnd.getTime() - Date.now()
      if (msLeft > 5 * 24 * 60 * 60 * 1000) {
        throw new BadRequestException(
          'Ya tienes un plan activo. Podrás renovar cuando falten 5 días o menos para el vencimiento.',
        )
      }
    }

    // Selección de horario (SDD-scheduling-v2): validar contra ventana + plan.
    let assignmentMode: 'auto' | 'manual' | null = null
    const slots = input.slots ?? []
    if (slots.length > 0) {
      await this.slots.validateSelection(slots, plan.daysPerWeek)
    }

    const intent = await this.prisma.paymentIntent.create({
      data: {
        reference,
        userId: input.userId,
        planId: plan.id,
        amountInCents,
        currency,
        customerEmail: input.customerEmail,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerDocument: input.customerDocument,
        scheduleJson: slots.length > 0 ? (slots as any) : undefined,
      },
    })

    if (slots.length > 0) {
      // Un intento nuevo del mismo comprador reemplaza sus reservas anteriores
      // (los pendings abandonados no deben bloquear su propia recompra).
      await this.slots.releasePreviousPendings(input.customerEmail, input.userId ?? buyer?.id)
      // Reserva de 20 min (decisión Q3). Renovación: los slots propios cuentan.
      const r = await this.slots.reserveForIntent(intent.id, slots, input.userId ?? buyer?.id)
      assignmentMode = r.mode
      await this.prisma.paymentIntent.update({ where: { id: intent.id }, data: { assignmentMode } })
    }

    const signature = crypto
      .createHash('sha256')
      .update(`${reference}${amountInCents}${currency}${env.WOMPI_INTEGRITY_SECRET}`)
      .digest('hex')

    // Wompi "Web Checkout" — pasarela pre-hosteada. Ver:
    // https://docs.wompi.co/docs/colombia/web-checkout/
    // IMPORTANTE: Wompi rechaza redirect-urls a localhost, así que SIEMPRE
    // usamos el dominio de producción (WOMPI_REDIRECT_URL), aunque el resto
    // de la app corra en local durante desarrollo.
    const redirectUrl = env.WOMPI_REDIRECT_URL
    // El link de pago vence junto con la reserva de franjas (20 min).
    const expirationTime = new Date(Date.now() + PENDING_HOLD_MINUTES * 60 * 1000).toISOString()
    const checkoutParams = new URLSearchParams({
      'public-key': env.WOMPI_PUBLIC_KEY,
      'expiration-time': expirationTime,
      currency,
      'amount-in-cents': String(amountInCents),
      reference,
      'signature:integrity': signature,
      'redirect-url': redirectUrl,
      'customer-data:email': input.customerEmail,
      'customer-data:full-name': input.customerName,
      'customer-data:phone-number': input.customerPhone,
      'customer-data:legal-id': input.customerDocument,
      'customer-data:legal-id-type': 'CC',
    })
    const checkoutUrl = `https://checkout.wompi.co/p/?${checkoutParams.toString()}`

    return {
      intentId: intent.id,
      reference,
      amountInCents,
      currency,
      signature,
      publicKey: env.WOMPI_PUBLIC_KEY,
      redirectUrl,
      checkoutUrl,
      assignmentMode,
    }
  }
}
