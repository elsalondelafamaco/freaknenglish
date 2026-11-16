import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import * as crypto from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { normalizarEmail } from '../../common/email'
import { SubscriptionsService } from '../subscriptions/subscriptions.service'
import { NotificationsService } from '../notifications/notifications.service'
import { SchedulingService } from '../scheduling/scheduling.service'
import { SlotsService } from '../scheduling/slots.service'
import { MetaCapiService } from '../meta/meta-capi.service'
import { env } from '../../config/env'
import { WompiApi, TransaccionWompi } from './wompi-api'

/**
 * Referencia del INTENTO a partir de la del cobro. El cobro directo manda una
 * por intento, `<referencia>-<n>`, porque Wompi no acepta repetirla; la
 * pasarela manda la del intento tal cual.
 */
export function referenciaBase(ref: string): string {
  const m = /^(FREAKN-\d+-[0-9a-f]{8})-\d+$/.exec(ref ?? '')
  return m ? m[1] : ref
}

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
    private meta: MetaCapiService,
    private api: WompiApi,
  ) {}

  /**
   * Verify HMAC signature per Wompi docs:
   * concat(values of properties) + timestamp + WOMPI_EVENTS_SECRET → SHA256
   * https://docs.wompi.co/docs/colombia/eventos
   */
  verifyAndParse(rawBody: string, headerEventId?: string): WompiEvent {
    if (!env.WOMPI_EVENTS_SECRET) {
      this.log.error('[webhook] WOMPI_EVENTS_SECRET no configurado — rechazando evento')
      throw new BadRequestException('Wompi events secret not configured')
    }
    let payload: WompiEvent
    try {
      payload = JSON.parse(rawBody) as WompiEvent
    } catch (e) {
      this.log.error(`[webhook] body no es JSON válido (len=${rawBody?.length}): ${rawBody?.slice(0, 300)}`)
      throw new BadRequestException('Invalid JSON body')
    }
    const tx = payload?.data?.transaction
    this.log.log(
      `[webhook] evento recibido: event=${payload?.event} eventId=${headerEventId ?? '-'} ` +
        `env=${(payload as any)?.environment ?? '-'} txId=${tx?.id} ref=${tx?.reference} ` +
        `status=${tx?.status} amount=${tx?.amount_in_cents} props=${JSON.stringify(payload?.signature?.properties)}`,
    )
    if (!payload?.signature?.checksum || !Array.isArray(payload?.signature?.properties)) {
      this.log.error('[webhook] payload sin signature.checksum/properties — rechazado')
      throw new BadRequestException('Missing signature')
    }
    const concat = payload.signature.properties
      .map((p) => p.split('.').reduce<any>((acc, k) => acc?.[k], payload.data))
      .join('')
    const expected = crypto
      .createHash('sha256')
      .update(`${concat}${payload.timestamp}${env.WOMPI_EVENTS_SECRET}`)
      .digest('hex')
    // Wompi envía el checksum en mayúsculas; comparamos sin case para no
    // rechazar firmas válidas (era la causa de webhooks 400 en prod).
    // Comparación en tiempo constante: con `!==` el tiempo de respuesta delata
    // cuántos caracteres del checksum acertó quien prueba firmas falsas.
    const a = Buffer.from(expected.toLowerCase())
    const b = Buffer.from(String(payload.signature.checksum).toLowerCase())
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      this.log.error(
        `[webhook] FIRMA INVÁLIDA txId=${tx?.id} ref=${tx?.reference}: ` +
          `esperado=${expected} recibido=${payload.signature.checksum} ` +
          `concat="${concat}" timestamp=${payload.timestamp} secretLen=${env.WOMPI_EVENTS_SECRET.length}`,
      )
      throw new BadRequestException('Invalid Wompi signature')
    }
    this.log.log(`[webhook] firma OK txId=${tx?.id} ref=${tx?.reference} status=${tx?.status}`)
    return payload
  }

  async handleEvent(event: WompiEvent) {
    // Un evento de hace más de un día es una repetición: la firma no lleva hora
    // de emisión, así que sin esto un evento viejo capturado se podría reenviar.
    const ts = Number(event.timestamp)
    if (Number.isFinite(ts) && ts > 0 && Math.abs(Date.now() / 1000 - ts) > 24 * 60 * 60) {
      this.log.warn(`[webhook] evento de hace más de 24 h descartado ref=${event.data?.transaction?.reference}`)
      return { ok: true, ignored: true }
    }
    return this.finalizeTransaction(event.data.transaction, event.event, event)
  }

  /** Consulta el estado real de la transacción directamente en Wompi. */
  async fetchTransaction(id: string): Promise<TransaccionWompi | null> {
    return this.api.transaccion(id)
  }

  /**
   * Finaliza vía POLL (return page): consulta el estado en Wompi por id y lo
   * procesa idempotentemente. Funciona antes o después del webhook.
   */
  async finalizeByWompiId(id: string): Promise<{ status: string; reference: string | null }> {
    const tx = await this.fetchTransaction(id)
    if (!tx) return { status: 'PENDING', reference: null }
    await this.finalizeTransaction(tx)
    // La referencia del INTENTO, no la del cobro: el cobro directo agrega `-n`.
    return { status: tx.status, reference: referenciaBase(tx.reference) }
  }

  /**
   * Pagos que quedaron pendientes y nadie volvió a mirar: quien aprobó en Nequi
   * y cerró Instagram, quien volvió del banco a otra pestaña. Los rescata el
   * tick de 5 minutos consultando Wompi directamente, sin esperar al webhook.
   */
  async conciliarPendientes(): Promise<number> {
    const ahora = Date.now()
    const pendientes = await this.prisma.paymentIntent.findMany({
      where: {
        status: 'PENDING',
        wompiId: { not: null },
        reviewReason: null,
        updatedAt: { gte: new Date(ahora - 24 * 60 * 60 * 1000), lte: new Date(ahora - 2 * 60 * 1000) },
      },
      select: { wompiId: true },
      orderBy: { updatedAt: 'asc' },
      take: 25,
    })
    let resueltos = 0
    for (const p of pendientes) {
      const tx = await this.api.transaccion(p.wompiId!)
      if (!tx || tx.status === 'PENDING') continue
      await this.finalizeTransaction(tx, 'conciliacion').catch((e) =>
        this.log.error(`[conciliacion] ${p.wompiId}: ${(e as Error).message}`),
      )
      resueltos++
    }
    if (resueltos > 0) this.log.log(`[conciliacion] ${resueltos} pago(s) pendiente(s) resuelto(s)`)
    return resueltos
  }

  /** Aviso interno a los admins de un pago que una persona tiene que revisar. */
  private async avisarRevision(intentId: string, reference: string, motivo: string) {
    const admins = await this.prisma.user.findMany({
      where: { role: 'admin', deletedAt: null },
      select: { id: true, email: true },
    })
    for (const a of admins) {
      await this.notifications.enqueue({
        userId: a.id,
        toEmail: a.email,
        template: 'welcome',
        subject: 'Pago para revisar',
        dedupeKey: `pago-revision:${intentId}:${a.id}`,
        inAppOnly: true,
        type: 'payment',
        title: 'Pago para revisar',
        body: `${motivo} Referencia ${reference}.`,
        linkUrl: '/admin',
      }).catch(() => null)
    }
  }

  /**
   * Núcleo idempotente compartido por webhook (push) y poll (return page).
   * La unicidad de `paymentEvent.wompiEventId` garantiza que la activación
   * ocurra EXACTAMENTE una vez aunque ambos caminos lleguen a la vez.
   */
  async finalizeTransaction(
    tx: WompiEvent['data']['transaction'] | TransaccionWompi,
    eventName = 'transaction.updated',
    rawEvent?: unknown,
  ) {
    this.log.log(`[finalize] txId=${tx.id} ref=${tx.reference} status=${tx.status} via=${eventName}`)
    // El cobro directo manda `<referencia>-<n>` (uno por intento); la pasarela,
    // la referencia tal cual. Las dos apuntan al mismo intento.
    const intent = await this.prisma.paymentIntent.findUnique({ where: { reference: referenciaBase(tx.reference) } })
    if (!intent) {
      this.log.warn(`[finalize] SIN paymentIntent para ref=${tx.reference} txId=${tx.id} — evento ignorado`)
      return { ok: true, ignored: true, status: tx.status }
    }
    this.log.log(
      `[finalize] intent=${intent.id} plan=${intent.planId} user=${intent.userId ?? 'GUEST'} ` +
        `email=${intent.customerEmail} estadoPrevio=${intent.status}`,
    )

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
      this.log.log(`[finalize] duplicado txId=${tx.id}:${tx.status} — ya procesado, no-op`)
      return { ok: true, duplicate: true, status: tx.status }
    }

    // Lo que NO debe mover el estado del intento:
    //
    // 1. Un intento anterior que se resuelve tarde. Se paga con tarjeta, se
    //    rechaza, se prueba Nequi; si el rechazo de la tarjeta llega después,
    //    no puede pisar el Nequi que está en curso. Una aprobación SÍ pasa
    //    siempre: es plata que entró.
    //    Solo en el cobro directo (`attempts > 0`), donde `wompiId` es siempre
    //    el cobro en curso. En la pasarela manda el último evento, como siempre.
    const directo = intent.attempts > 0
    const esOtroCobro = !!intent.wompiId && intent.wompiId !== tx.id
    if (directo && esOtroCobro && tx.status !== 'APPROVED') {
      this.log.log(`[finalize] ${tx.status} de un cobro anterior (${tx.id}) — el actual es ${intent.wompiId}, no se toca`)
      return { ok: true, ignored: true, status: tx.status }
    }
    // 2. Una anulación o rechazo DESPUÉS de aprobado. El plan ya se activó con
    //    ese pago; quitárselo en silencio no es decisión del sistema.
    if (intent.status === 'APPROVED' && tx.status !== 'APPROVED') {
      this.log.error(`[finalize] ${tx.status} sobre un pago ya APROBADO intent=${intent.id} — a revisión`)
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { reviewReason: `Llegó ${tx.status} sobre un pago ya aprobado (${tx.id}).` },
      })
      await this.avisarRevision(intent.id, intent.reference, `Wompi marcó ${tx.status} un pago que ya estaba aprobado.`)
      return { ok: true, review: true, status: tx.status }
    }

    if (tx.status === 'APPROVED') {
      // 3. Una SEGUNDA aprobación del mismo intento: dos cobros que pasaron.
      //    No se extiende el plan otra vez; hay que devolver uno.
      if (intent.status === 'APPROVED' && esOtroCobro) {
        this.log.error(`[finalize] DOBLE COBRO intent=${intent.id}: ya aprobado con ${intent.wompiId}, ahora ${tx.id}`)
        await this.prisma.paymentIntent.update({
          where: { id: intent.id },
          data: { reviewReason: `Doble cobro: aprobado con ${intent.wompiId} y con ${tx.id}. Devolver uno.` },
        })
        await this.avisarRevision(intent.id, intent.reference, 'Se cobró dos veces el mismo plan: hay que devolver uno de los pagos.')
        return { ok: true, review: true, status: tx.status }
      }
      // 4. Monto o moneda distintos a los del intento. Hasta hoy no se miraba:
      //    un pago por otro valor activaba el plan igual.
      if (tx.amount_in_cents !== intent.amountInCents || tx.currency !== intent.currency) {
        this.log.error(
          `[finalize] APROBADO CON OTRO MONTO intent=${intent.id}: esperado ${intent.amountInCents} ${intent.currency}, ` +
            `llegó ${tx.amount_in_cents} ${tx.currency} — no se activa`,
        )
        await this.prisma.paymentIntent.update({
          where: { id: intent.id },
          data: {
            wompiId: tx.id,
            reviewReason: `Aprobado por ${tx.amount_in_cents} ${tx.currency}; se esperaba ${intent.amountInCents} ${intent.currency}.`,
          },
        })
        await this.avisarRevision(intent.id, intent.reference, 'Llegó un pago aprobado por un monto distinto al del plan; no se activó nada.')
        return { ok: true, review: true, status: tx.status }
      }
    }

    await this.prisma.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: tx.status as any,
        wompiId: tx.id,
        approvedAt: tx.status === 'APPROVED' ? new Date() : undefined,
      },
    })

    // Un rechazo en el cobro directo NO suelta las franjas: lo normal es que
    // pruebe otro medio en seguida, y soltarlas le daría la hora a otro en ese
    // minuto. La reserva vence sola si no vuelve. En la pasarela se sueltan
    // como siempre, porque ahí un rechazo suele ser el final.
    if (['DECLINED', 'VOIDED', 'ERROR'].includes(tx.status) && !directo) {
      this.log.warn(`[finalize] pago ${tx.status} intent=${intent.id} — liberando slots reservados`)
      await this.slots.releasePendingForIntent(intent.id).catch((e) =>
        this.log.error(`[finalize] releasePendingForIntent falló: ${(e as Error).message}`),
      )
    }

    if (tx.status === 'APPROVED') {
      let userId = intent.userId
      if (!userId) {
        const email = normalizarEmail(intent.customerEmail)
        let user = await this.prisma.user.findUnique({ where: { email } })
        const token = crypto.randomBytes(24).toString('hex')
        const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
        const chosenHash = (intent as any).passwordHash as string | null
        if (!user) {
          user = await this.prisma.user.create({
            data: {
              email,
              fullName: intent.customerName,
              phone: intent.customerPhone ?? undefined,
              documentNumber: intent.customerDocument ?? undefined,
              role: 'student' as any,
              // La zona con la que eligió su horario en el checkout: si no se
              // guarda, entra a la plataforma y ve horas distintas a las que
              // escogió.
              ...(intent.timezone ? { timezone: intent.timezone } : {}),
              // Si eligió contraseña en el checkout, la cuenta nace lista;
              // si no, flujo de invitación por token.
              ...(chosenHash
                ? { passwordHash: chosenHash }
                : { setPasswordToken: token, setPasswordTokenExpiresAt: expires }),
            },
          })
        } else if (chosenHash && !user.passwordHash) {
          // Cuenta invitada sin contraseña: adopta la elegida en el checkout.
          user = await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: chosenHash } })
        }
        userId = user.id
        await this.prisma.paymentIntent.update({ where: { id: intent.id }, data: { userId } })
        this.log.log(`[finalize] usuario invitado/creado para checkout guest: user=${userId} email=${email}`)
      }
      this.log.log(`[finalize] APROBADO — activando plan=${intent.planId} para user=${userId}`)
      await this.subs.activateForUser(userId, intent.planId)
      // La compra, a Meta desde el servidor. Va aquí, pasada la guarda del
      // `paymentEvent` único, para que salga UNA vez por pago aunque el webhook
      // y la página de retorno lleguen los dos. No se espera: Meta no puede
      // demorar ni romper la activación.
      void this.meta.reportarCompra({ ...intent, userId, approvedAt: new Date() })
      // Materializa el horario comprado: reserva→active / renovación / fallback / manual.
      try {
        await this.scheduling.materializePurchase(userId, {
          id: intent.id,
          scheduleJson: (intent as any).scheduleJson ?? undefined,
          // La marca viene congelada del checkout a propósito: recalcularla aquí
          // podría contradecir lo que se le mostró al estudiante al pagar.
          esRenovacion: (intent as any).esRenovacion === true,
        })
      } catch (e) {
        this.log.error(`materializePurchase failed for intent ${intent.id}: ${(e as Error).message}`)
      }
      const plan = await this.prisma.plan.findUnique({ where: { id: intent.planId } })
      await this.notifications.enqueue({
        userId,
        toEmail: intent.customerEmail,
        template: 'welcome_plan',
        subject: '¡Bienvenido a Freakn! Tu plan está activo',
        // Mismo namespace que la bienvenida de registro: si el usuario ya se
        // había registrado antes de pagar, NO recibe una segunda bienvenida.
        dedupeKey: `welcome:${userId}`,
        vars: { fullName: intent.customerName, planName: plan?.name },
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
