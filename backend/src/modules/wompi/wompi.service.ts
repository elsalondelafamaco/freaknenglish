import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import * as crypto from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { SubscriptionsService } from '../subscriptions/subscriptions.service'
import { NotificationsService } from '../notifications/notifications.service'
import { env } from '../../config/env'

type WompiEvent = {
  event: string
  data: {
    transaction: {
      id: string
      reference: string
      status: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING'
      amount_in_cents: number
      currency: string
      customer_email: string
    }
  }
  signature: { properties: string[]; checksum: string }
  timestamp: number
}

@Injectable()
export class WompiService {
  private readonly log = new Logger(WompiService.name)
  constructor(
    private prisma: PrismaService,
    private subs: SubscriptionsService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Verify HMAC signature per Wompi docs:
   * concat(values of properties) + timestamp + WOMPI_EVENTS_SECRET → SHA256
   * https://docs.wompi.co/docs/colombia/eventos
   */
  verifyAndParse(rawBody: string, headerEventId?: string): WompiEvent {
    const payload = JSON.parse(rawBody) as WompiEvent
    const concat = payload.signature.properties
      .map((p) => p.split('.').reduce<any>((acc, k) => acc?.[k], payload.data))
      .join('')
    const expected = crypto
      .createHash('sha256')
      .update(`${concat}${payload.timestamp}${env.WOMPI_EVENTS_SECRET}`)
      .digest('hex')
    if (expected !== payload.signature.checksum) {
      throw new BadRequestException('Invalid Wompi signature')
    }
    void headerEventId
    return payload
  }

  async handleEvent(event: WompiEvent) {
    const tx = event.data.transaction
    const intent = await this.prisma.paymentIntent.findUnique({ where: { reference: tx.reference } })
    if (!intent) {
      this.log.warn(`No intent for reference ${tx.reference}`)
      return { ok: true, ignored: true }
    }

    // Idempotency: skip if we already recorded this Wompi tx id with this status
    const existing = await this.prisma.paymentEvent.findUnique({
      where: { wompiEventId: `${tx.id}:${tx.status}` },
    })
    if (existing) return { ok: true, duplicate: true }

    await this.prisma.paymentEvent.create({
      data: {
        intentId: intent.id,
        wompiEventId: `${tx.id}:${tx.status}`,
        event: event.event,
        status: tx.status as any,
        rawPayload: event as any,
      },
    })

    await this.prisma.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: tx.status as any,
        wompiId: tx.id,
        approvedAt: tx.status === 'APPROVED' ? new Date() : undefined,
      },
    })

    if (tx.status === 'APPROVED' && intent.userId) {
      await this.subs.activateForUser(intent.userId, intent.planId)
      await this.notifications.enqueue({
        userId: intent.userId,
        toEmail: intent.customerEmail,
        template: 'welcome',
        subject: '¡Bienvenido a Freakn!',
        dedupeKey: `welcome:${intent.userId}`,
        vars: { fullName: intent.customerName },
      })
    }

    return { ok: true }
  }
}
