import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import * as crypto from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { SubscriptionsService } from '../subscriptions/subscriptions.service'
import { NotificationsService } from '../notifications/notifications.service'
import { SchedulingService } from '../scheduling/scheduling.service'
import { SlotsService } from '../scheduling/slots.service'
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
    private scheduling: SchedulingService,
    private slots: SlotsService,
  ) {}

  /**
   * Verify HMAC signature per Wompi docs:
   * concat(values of properties) + timestamp + WOMPI_EVENTS_SECRET → SHA256
   * https://docs.wompi.co/docs/colombia/eventos
   */
  verifyAndParse(rawBody: string, headerEventId?: string): WompiEvent {
    if (!env.WOMPI_EVENTS_SECRET) {
      throw new BadRequestException('Wompi events secret not configured')
    }
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
    return this.finalizeTransaction(event.data.transaction, event.event, event)
  }

  private wompiApiBase(): string {
    return env.WOMPI_ENV === 'production'
      ? 'https://production.wompi.co/v1'
      : 'https://sandbox.wompi.co/v1'
  }

  /** Consulta el estado real de la transacción directamente en Wompi (GET público). */
  async fetchTransaction(id: string): Promise<WompiEvent['data']['transaction'] | null> {
    try {
      const res = await fetch(`${this.wompiApiBase()}/transactions/${id}`, {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        this.log.warn(`Wompi tx ${id} fetch -> ${res.status}`)
        return null
      }
      const json = (await res.json()) as any
      const d = json?.data
      if (!d) return null
      return {
        id: d.id,
        reference: d.reference,
        status: d.status,
        amount_in_cents: d.amount_in_cents,
        currency: d.currency,
        customer_email: d.customer_email,
      }
    } catch (e) {
      this.log.warn(`Wompi tx fetch failed: ${(e as Error).message}`)
      return null
    }
  }

  /**
   * Finaliza vía POLL (return page): consulta el estado en Wompi por id y lo
   * procesa idempotentemente. Funciona antes o después del webhook.
   */
  async finalizeByWompiId(id: string): Promise<{ status: string; reference: string | null }> {
    const tx = await this.fetchTransaction(id)
    if (!tx) return { status: 'PENDING', reference: null }
    await this.finalizeTransaction(tx)
    return { status: tx.status, reference: tx.reference }
  }

  /**
   * Núcleo idempotente compartido por webhook (push) y poll (return page).
   * La unicidad de `paymentEvent.wompiEventId` garantiza que la activación
   * ocurra EXACTAMENTE una vez aunque ambos caminos lleguen a la vez.
   */
  async finalizeTransaction(
    tx: WompiEvent['data']['transaction'],
    eventName = 'transaction.updated',
    rawEvent?: unknown,
  ) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { reference: tx.reference } })
    if (!intent) {
      this.log.warn(`No intent for reference ${tx.reference}`)
      return { ok: true, ignored: true, status: tx.status }
    }

    // Gana quien logre crear el paymentEvent (unique). El resto sale como duplicado.
    try {
      await this.prisma.paymentEvent.create({
        data: {
          intentId: intent.id,
          wompiEventId: `${tx.id}:${tx.status}`,
          event: eventName,
          status: tx.status as any,
          rawPayload: (rawEvent ?? tx) as any,
        },
      })
    } catch {
      return { ok: true, duplicate: true, status: tx.status }
    }

    await this.prisma.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: tx.status as any,
        wompiId: tx.id,
        approvedAt: tx.status === 'APPROVED' ? new Date() : undefined,
      },
    })

    if (['DECLINED', 'VOIDED', 'ERROR'].includes(tx.status)) {
      await this.slots.releasePendingForIntent(intent.id).catch(() => null)
    }

    if (tx.status === 'APPROVED') {
      let userId = intent.userId
      if (!userId) {
        const email = intent.customerEmail.toLowerCase()
        let user = await this.prisma.user.findUnique({ where: { email } })
        const token = crypto.randomBytes(24).toString('hex')
        const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
        if (!user) {
          user = await this.prisma.user.create({
            data: {
              email,
              fullName: intent.customerName,
              phone: intent.customerPhone ?? undefined,
              documentNumber: intent.customerDocument ?? undefined,
              role: 'student' as any,
              setPasswordToken: token,
              setPasswordTokenExpiresAt: expires,
            },
          })
        }
        userId = user.id
        await this.prisma.paymentIntent.update({ where: { id: intent.id }, data: { userId } })
      }
      await this.subs.activateForUser(userId, intent.planId)
      // Materializa el horario comprado: reserva→active / renovación / fallback / manual.
      try {
        await this.scheduling.materializePurchase(userId, {
          id: intent.id,
          scheduleJson: (intent as any).scheduleJson ?? undefined,
        })
      } catch (e) {
        this.log.error(`materializePurchase failed for intent ${intent.id}: ${(e as Error).message}`)
      }
      const plan = await this.prisma.plan.findUnique({ where: { id: intent.planId } })
      await this.notifications.enqueue({
        userId,
        toEmail: intent.customerEmail,
        template: 'welcome',
        subject: '¡Bienvenido a Freakn!',
        dedupeKey: `welcome:${userId}`,
        vars: { fullName: intent.customerName },
        type: 'system',
        title: '¡Bienvenido!',
        body: 'Tu cuenta está lista.',
        linkUrl: '/app',
      })
      await this.notifications.enqueue({
        userId,
        toEmail: intent.customerEmail,
        template: 'payment_success',
        subject: 'Pago confirmado',
        dedupeKey: `payment:${intent.id}`,
        vars: {
          fullName: intent.customerName,
          planName: plan?.name ?? 'tu plan',
          amountInCents: intent.amountInCents,
          currency: intent.currency,
          reference: intent.reference,
        },
        type: 'payment',
        title: 'Pago confirmado',
        body: `Recibimos tu pago de ${intent.currency} ${(intent.amountInCents / 100).toLocaleString('es-CO')}.`,
        linkUrl: '/app/settings',
      })
    }

    return { ok: true, status: tx.status }
  }
}
