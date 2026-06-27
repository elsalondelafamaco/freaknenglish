import { Injectable, NotFoundException } from '@nestjs/common'
import * as crypto from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { env } from '../../config/env'

@Injectable()
export class CheckoutService {
  constructor(private prisma: PrismaService) {}

  /**
   * Creates a PaymentIntent and returns the payload the Wompi Checkout Widget needs.
   * Wompi integrity signature spec: SHA256(reference + amountInCents + currency + WOMPI_INTEGRITY_SECRET)
   * https://docs.wompi.co/docs/colombia/widget-checkout-web/#firma-de-integridad
   */
  async createIntent(input: {
    planId: string
    customerEmail: string
    customerName: string
    customerPhone?: string
    userId?: string
  }) {
    const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } })
    if (!plan) throw new NotFoundException('Plan not found')

    const reference = `FREAKN-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    const amountInCents = plan.priceCop * 100
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
      },
    })

    const signature = crypto
      .createHash('sha256')
      .update(`${reference}${amountInCents}${currency}${env.WOMPI_INTEGRITY_SECRET}`)
      .digest('hex')

    return {
      intentId: intent.id,
      reference,
      amountInCents,
      currency,
      signature,
      publicKey: env.WOMPI_PUBLIC_KEY,
      redirectUrl: `${env.PUBLIC_SITE_URL}/checkout/return`,
    }
  }
}
