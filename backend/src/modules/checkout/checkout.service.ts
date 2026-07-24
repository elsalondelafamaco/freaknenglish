import { Injectable, NotFoundException } from '@nestjs/common'
import * as crypto from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { env } from '../../config/env'
import { ExchangeService } from '../exchange/exchange.service'

@Injectable()
export class CheckoutService {
  constructor(private prisma: PrismaService, private exchange: ExchangeService) {}

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
      },
    })

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
    const checkoutParams = new URLSearchParams({
      'public-key': env.WOMPI_PUBLIC_KEY,
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
    }
  }
}
