import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import * as crypto from 'crypto'
import * as argon2 from 'argon2'
import { PrismaService } from '../../prisma/prisma.service'
import { env } from '../../config/env'
import { ExchangeService } from '../exchange/exchange.service'
import { SlotsService, SlotRef, PENDING_HOLD_MINUTES } from '../scheduling/slots.service'
import { esZonaValida } from '../../common/zona-horaria'
import { configuracionDirecta } from '../wompi/wompi-api'
import { PromotionsService } from '../promotions/promotions.service'
import { Atribucion, precioListaCop } from '../promotions/promo-precio'

@Injectable()
export class CheckoutService {
  constructor(
    private prisma: PrismaService,
    private exchange: ExchangeService,
    private slots: SlotsService,
    private promos: PromotionsService,
  ) {}

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
    timezone?: string
    fbp?: string
    fbc?: string
    eventSourceUrl?: string
    clientIp?: string
    clientUserAgent?: string
    atribucion?: Atribucion
  }) {
    const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } })
    // Un plan inactivo no existe para el checkout público: el listado ya lo
    // filtra, pero un POST directo con el planId saltaba ese filtro.
    if (!plan || !plan.isActive) throw new NotFoundException('Plan not found')

    const reference = `FREAKN-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    // El precio del plan está en USD; el cobro a Wompi es en COP convertido con
    // la TRM (COP/USD) en tiempo real en este instante. Fallback a priceCop.
    // Aquí solo se calcula el precio de LISTA: la promoción se aplica más abajo,
    // cuando ya se sabe si es una renovación.
    let trmCop = 0
    if (plan.priceUsd && plan.priceUsd > 0) {
      trmCop = (await this.exchange.getCurrentTrm()).valueCop
    }
    const listaCop = precioListaCop(plan, trmCop)
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
    //
    // La tercera condición es el número de franjas: si compra un plan de más
    // días de los que tiene, NO es una renovación — se quedaría con 3 clases a
    // la semana pagando 5. Ahí sí toca elegir las horas nuevas, y ahora el
    // selector ya le habla en su hora, que era lo que fallaba.
    const propias = buyer?.id ? await this.slots.slotsOfStudent(buyer.id) : []
    const esRenovacion =
      !!buyer?.assignedTeacherId && propias.length > 0 && propias.length === plan.daysPerWeek

    // Promoción: se decide en el servidor con el estado real (renovación o no) y
    // la atribución que mandó el navegador; del cliente nunca se acepta un monto.
    // El descuento queda congelado en el intento y todo lo que viene después
    // (firma de Wompi, cobro directo, verificación del pago, Meta) lee
    // `amountInCents`, así que cobra exactamente lo que se mostró.
    const atribucion = limpiarAtribucion(input.atribucion)
    const elegida = await this.promos.elegirParaCobro(
      { id: plan.id, priceCop: plan.priceCop, priceUsd: plan.priceUsd },
      trmCop,
      esRenovacion,
      atribucion,
    )
    const amountCop = elegida ? elegida.precio.finalCop : listaCop
    const amountInCents = amountCop * 100

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
        promotionId: elegida?.promo.id,
        listAmountInCents: elegida ? listaCop * 100 : undefined,
        discountInCents: elegida ? elegida.precio.descuentoCop * 100 : undefined,
        atribucion: atribucion ? (atribucion as Record<string, string>) : undefined,
        ...(esRenovacion ? { assignmentMode: 'auto' } : {}),
        // La zona con la que vio las horas al elegir. Se valida aquí porque
        // llega de un formulario público: un valor corrupto no puede quedar
        // guardado en la cuenta.
        timezone: input.timezone && esZonaValida(input.timezone) ? input.timezone : undefined,
        // Para atribuir la compra en Meta cuando el webhook la confirme. Se
        // recortan porque llegan de un formulario público.
        fbp: input.fbp?.slice(0, 200) || undefined,
        fbc: input.fbc?.slice(0, 500) || undefined,
        eventSourceUrl: input.eventSourceUrl?.slice(0, 500) || undefined,
        clientIp: input.clientIp?.slice(0, 64) || undefined,
        clientUserAgent: input.clientUserAgent?.slice(0, 500) || undefined,
        // Credenciales elegidas en el checkout: solo se guarda el hash.
        passwordHash: input.password ? await argon2.hash(input.password) : undefined,
        // Llave para pagar o retomar este intento desde el navegador (cobro
        // directo). La referencia sola no alcanza: se ve en correos y URLs.
        accessKey: crypto.randomBytes(24).toString('base64url'),
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
      // Cómo cobrar: `direct` dentro del sitio, `hosted` con la pasarela. La
      // URL de la pasarela viaja siempre, de salida por si el directo falla.
      modo: configuracionDirecta().ok ? ('direct' as const) : ('hosted' as const),
      accessKey: intent.accessKey,
      // Para que el checkout muestre el descuento con la etiqueta de la promo.
      promocion: elegida
        ? {
            label: elegida.promo.checkoutLabel ?? 'Descuento',
            discountInCents: elegida.precio.descuentoCop * 100,
            listAmountInCents: listaCop * 100,
          }
        : null,
    }
  }
}

/** Solo las claves conocidas y recortadas: llega de un formulario público. */
function limpiarAtribucion(a?: Atribucion): Atribucion | null {
  if (!a) return null
  const claves = ['promo', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const
  const out: Atribucion = {}
  for (const k of claves) {
    const v = a[k]
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 100)
  }
  return Object.keys(out).length > 0 ? out : null
}
