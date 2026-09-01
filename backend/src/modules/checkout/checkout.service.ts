import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import * as crypto from 'crypto'
import * as argon2 from 'argon2'
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
    password?: string
  }) {
    const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } })
    // Un plan inactivo no existe para el checkout público: el listado ya lo
    // filtra, pero un POST directo con el planId saltaba ese filtro.
    if (!plan || !plan.isActive) throw new NotFoundException('Plan not found')

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

    // ¿Es una renovación? Se decide AQUÍ y con el estado del servidor, nunca con
    // lo que mande el navegador: fue justo el horario enviado desde el cliente
    // lo que permitió que una estudiante en San Francisco "eligiera" las 9:00
    // pensando en su hora y acabara con otra profesora.
    //
    // Las dos condiciones son necesarias: sin profe (pago manual pendiente) sí
    // hay que elegir horario, y sin franjas (se le liberaron al vencer) también.
    const propias = buyer?.id ? await this.slots.slotsOfStudent(buyer.id) : []
    const esRenovacion = !!buyer?.assignedTeacherId && propias.length > 0

    // Selección de horario (SDD-scheduling-v2): validar contra ventana + plan.
    // Un estudiante interno con clase larga (classDurationMin) que renueva por
    // aquí valida con SU duración: sus reglas de separación siguen aplicando.
    let assignmentMode: 'auto' | 'manual' | null = null
    const slots = esRenovacion
      ? propias.map((s) => ({ weekday: s.weekday, hour: s.hour }))
      : (input.slots ?? [])
    // Una renovación NO se valida contra las reglas de hoy: su horario puede ser
    // anterior a que se estrechara la ventana del admin o cambiara `maxPerDay`,
    // y no tiene sentido rechazarle el pago por una regla que no se le está
    // pidiendo cumplir —y menos con un error que no le dice qué hacer.
    if (slots.length > 0 && !esRenovacion) {
      let durationMin = 50
      if (input.userId) {
        const u = await this.prisma.user.findUnique({
          where: { id: input.userId },
          select: { classDurationMin: true },
        })
        durationMin = u?.classDurationMin ?? 50
      }
      await this.slots.validateSelection(slots, plan.daysPerWeek, durationMin)
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
        esRenovacion,
        ...(esRenovacion ? { assignmentMode: 'auto' } : {}),
        // Credenciales elegidas en el checkout: solo se guarda el hash.
        passwordHash: input.password ? await argon2.hash(input.password) : undefined,
      },
    })

    // En una renovación no hay nada que reservar: las franjas ya son suyas. Y
    // reservar haría daño: `reserveForIntent` recorre a los profes por MENOR
    // CARGA, y el suyo no suele ser el primero — para un candidato anterior sus
    // horas están libres, así que crearía reservas de 20 minutos a nombre de
    // otro profe y bloquearía esas franjas para compradores reales.
    if (slots.length > 0 && !esRenovacion) {
      // Un intento nuevo del mismo comprador reemplaza sus reservas anteriores
      // (los pendings abandonados no deben bloquear su propia recompra).
      await this.slots.releasePreviousPendings(input.customerEmail, input.userId ?? buyer?.id)
      // Reserva de 20 min (decisión Q3). Renovación: los slots propios cuentan.
      const r = await this.slots.reserveForIntent(intent.id, slots, input.userId ?? buyer?.id)
      assignmentMode = r.mode
      await this.prisma.paymentIntent.update({ where: { id: intent.id }, data: { assignmentMode } })
    }

    // Wompi: si el checkout lleva expiration-time, la firma DEBE incluirla:
    // SHA256(reference + amountInCents + currency + expirationTime + secret)
    // https://docs.wompi.co/docs/colombia/widget-checkout-web/#firma-de-integridad
    const expirationTime = new Date(Date.now() + PENDING_HOLD_MINUTES * 60 * 1000).toISOString()
    const signature = crypto
      .createHash('sha256')
      .update(`${reference}${amountInCents}${currency}${expirationTime}${env.WOMPI_INTEGRITY_SECRET}`)
      .digest('hex')

    // Wompi "Web Checkout" — pasarela pre-hosteada. Ver:
    // https://docs.wompi.co/docs/colombia/web-checkout/
    // IMPORTANTE: Wompi rechaza redirect-urls a localhost, así que SIEMPRE
    // usamos el dominio de producción (WOMPI_REDIRECT_URL), aunque el resto
    // de la app corra en local durante desarrollo.
    const redirectUrl = env.WOMPI_REDIRECT_URL
    // El link de pago vence junto con la reserva de franjas (20 min).
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
