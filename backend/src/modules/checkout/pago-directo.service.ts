import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { timingSafeEqual } from 'node:crypto'
import type { PaymentIntent } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { env } from '../../config/env'
import { SlotsService, SlotRef } from '../scheduling/slots.service'
import { WompiService } from '../wompi/wompi.service'
import {
  WompiApi,
  WompiError,
  MEDIOS_SOPORTADOS,
  MedioDePago,
  TransaccionWompi,
  configuracionDirecta,
  siguientePaso,
} from '../wompi/wompi-api'

/** Lo que manda el navegador para cobrar, según el medio. */
export type DatosDePago = {
  metodo: MedioDePago
  // Tarjeta (el número ya viene tokenizado por Wompi en el navegador)
  token?: string
  cuotas?: number
  browserInfo?: Record<string, unknown>
  // Antifraude de Wompi
  sessionId?: string
  deviceId?: string
  // Nequi y PSE
  telefono?: string
  // PSE y Daviplata
  banco?: string
  tipoPersona?: number
  tipoDocumento?: string
  documento?: string
}

/** Cuánto bloquea un cobro en curso a otro. Pasado esto se deja reintentar. */
const EN_CURSO_MS = 10 * 60 * 1000
/** Reserva de franjas mientras se paga: Nequi, PSE o el 3DS pueden tardar. */
const RESERVA_AL_PAGAR_MIN = 30

const DOCUMENTOS_PSE = ['CC', 'CE', 'NIT', 'PP', 'TI']
const DOCUMENTOS_DAVIPLATA = ['CC', 'CE', 'PP', 'TI']
const CAMPOS_NAVEGADOR = [
  'browser_color_depth',
  'browser_screen_height',
  'browser_screen_width',
  'browser_language',
  'browser_user_agent',
  'browser_tz',
] as const

const soloDigitos = (s?: string | null) => String(s ?? '').replace(/\D/g, '')

/**
 * Celular colombiano de 10 dígitos (3xx), con o sin el 57 adelante. Wompi lo
 * pide así, sin indicativo: Nequi para cobrar y PSE en `customer_data`.
 */
export function celularColombiano(telefono?: string | null): string | null {
  let d = soloDigitos(telefono)
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2)
  return /^3\d{9}$/.test(d) ? d : null
}

/** Wompi rechaza símbolos raros en la descripción y la limita por medio. */
function descripcion(texto: string, max: number): string {
  return texto.replace(/[^\p{L}\p{N} .,-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max)
}

@Injectable()
export class PagoDirectoService {
  private readonly log = new Logger(PagoDirectoService.name)

  constructor(
    private prisma: PrismaService,
    private api: WompiApi,
    private wompi: WompiService,
    private slots: SlotsService,
  ) {}

  /** Lo que el paso de pago necesita para pintarse. */
  async info() {
    const c = configuracionDirecta()
    if (!c.ok) return { modo: 'hosted' as const }
    try {
      const [comercio, bancos] = await Promise.all([this.api.infoComercio(), this.api.bancosPse().catch(() => [])])
      return {
        modo: 'direct' as const,
        llavePublica: env.WOMPI_PUBLIC_KEY,
        apiUrl: this.api.base,
        medios: comercio.mediosActivos,
        bancos,
        terminosUrl: comercio.terminosUrl,
        datosUrl: comercio.datosUrl,
      }
    } catch (e) {
      // Si Wompi no responde ni para esto, la pasarela es la salida: que la
      // venta no se pierda porque el cobro directo no pudo arrancar.
      this.log.warn(`Info de Wompi no disponible, se ofrece la pasarela: ${(e as Error).message}`)
      return { modo: 'hosted' as const }
    }
  }

  /**
   * Intento de pago por su referencia y su llave. Sin la llave correcta, "no
   * existe": la referencia se ve en correos y URLs y no debe bastar para cobrar.
   */
  private async cargar(reference: string, llave: string): Promise<PaymentIntent> {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { reference } })
    const a = Buffer.from(String(intent?.accessKey ?? ''))
    const b = Buffer.from(String(llave ?? ''))
    if (!intent || !intent.accessKey || a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new NotFoundException('No encontramos este pago. Vuelve a empezar desde los planes.')
    }
    return intent
  }

  /** El estado tal como lo lee el navegador, con el siguiente paso si está en curso. */
  private respuesta(intent: PaymentIntent, tx: TransaccionWompi | null) {
    const pendiente = intent.status === 'PENDING' && !!intent.wompiId
    const enCurso =
      pendiente && !!intent.paymentStartedAt && Date.now() - intent.paymentStartedAt.getTime() < EN_CURSO_MS
    return {
      reference: intent.reference,
      // REVISION: aprobado pero algo no cuadra (monto, doble cobro). Al
      // navegador se le dice que no vuelva a pagar y que lo contactamos.
      estado: intent.reviewReason ? 'REVISION' : !intent.wompiId ? 'SIN_PAGO' : intent.status,
      metodo: intent.wompiMethod,
      enCurso,
      ...(pendiente ? siguientePaso(tx) : { irAlBanco: null, tresDs: null, otp: null }),
      mensaje: tx?.status_message ?? null,
      planId: intent.planId,
      amountInCents: intent.amountInCents,
      currency: intent.currency,
      esRenovacion: intent.esRenovacion,
    }
  }

  /** Estado actual, consultando a Wompi. Es lo que se sondea y lo que retoma un pago. */
  async estado(reference: string, llave: string) {
    let intent = await this.cargar(reference, llave)
    if (!intent.wompiId) return this.respuesta(intent, null)
    const tx = await this.api.transaccion(intent.wompiId)
    if (tx) {
      await this.wompi.finalizeTransaction(tx, 'consulta').catch((e) =>
        this.log.error(`[pago] finalize en consulta ${reference}: ${(e as Error).message}`),
      )
      intent = (await this.prisma.paymentIntent.findUnique({ where: { id: intent.id } }))!
    }
    return this.respuesta(intent, tx)
  }

  /** Cobrar. Devuelve el estado y lo que tiene que hacer el navegador. */
  async pagar(reference: string, llave: string, datos: DatosDePago, ctx: { ip?: string }) {
    if (!configuracionDirecta().ok) {
      throw new ConflictException('El pago en el sitio no está disponible ahora. Continúa con la pasarela de pago.')
    }
    let intent = await this.cargar(reference, llave)
    if (intent.status === 'APPROVED' || intent.reviewReason) return this.respuesta(intent, null)

    // ¿Hay un cobro anterior que ya se resolvió y aún no lo sabemos? Se
    // pregunta antes de decidir si se puede cobrar de nuevo.
    if (intent.wompiId && intent.status === 'PENDING') {
      const previo = await this.api.transaccion(intent.wompiId)
      if (previo && previo.status !== 'PENDING') {
        await this.wompi.finalizeTransaction(previo, 'consulta').catch(() => null)
        intent = (await this.prisma.paymentIntent.findUnique({ where: { id: intent.id } }))!
        if (intent.status === 'APPROVED' || intent.reviewReason) return this.respuesta(intent, previo)
      }
    }

    if (!MEDIOS_SOPORTADOS.includes(datos.metodo)) throw new BadRequestException('Elige un medio de pago.')
    const comercio = await this.api.infoComercio().catch(() => null)
    if (comercio && !comercio.mediosActivos.includes(datos.metodo)) {
      throw new BadRequestException('Este medio de pago no está disponible ahora mismo. Elige otro.')
    }

    const plan = await this.prisma.plan.findUnique({ where: { id: intent.planId }, select: { name: true } })
    const redirectUrl = `${env.WOMPI_REDIRECT_URL}?reference=${encodeURIComponent(intent.reference)}`
    const paymentMethod = this.armarMedio(datos, intent, plan?.name ?? 'plan', redirectUrl)
    const customerData = this.armarCliente(datos, intent)

    // Turno de cobro, en UNA escritura: solo pasa si no hay otro cobro en curso.
    // Dos toques seguidos o dos pestañas a la vez no pueden sacar dos cobros
    // (dos notificaciones de Nequi que el cliente podría aprobar las dos).
    //
    // Pasa a PENDING en la misma escritura: si no, tras un rechazo dos toques
    // seguidos verían los dos el estado "rechazado" y pasarían los dos.
    const ahora = new Date()
    const estadoPrevio = intent.status
    const turno = await this.prisma.paymentIntent.updateMany({
      where: {
        id: intent.id,
        status: { not: 'APPROVED' },
        reviewReason: null,
        OR: [
          { paymentStartedAt: null },
          { paymentStartedAt: { lt: new Date(ahora.getTime() - EN_CURSO_MS) } },
          { status: { in: ['DECLINED', 'VOIDED', 'ERROR'] } },
        ],
      },
      data: { paymentStartedAt: ahora, attempts: { increment: 1 }, status: 'PENDING' },
    })
    if (turno.count === 0) {
      // Ya hay un cobro en curso: se devuelve ese para retomarlo.
      const actual = (await this.prisma.paymentIntent.findUnique({ where: { id: intent.id } }))!
      const tx = actual.wompiId ? await this.api.transaccion(actual.wompiId) : null
      return { ...this.respuesta(actual, tx), reanudado: true }
    }
    intent = (await this.prisma.paymentIntent.findUnique({ where: { id: intent.id } }))!
    const refCobro = `${intent.reference}-${intent.attempts}`
    await this.mantenerReserva(intent)

    let tx: TransaccionWompi | null
    try {
      tx = await this.api.crearTransaccion({
        reference: refCobro,
        amountInCents: intent.amountInCents,
        email: intent.customerEmail,
        paymentMethod,
        customerData,
        redirectUrl,
        ip: ctx.ip,
        sessionId: datos.sessionId?.slice(0, 200),
      })
    } catch (e) {
      // Wompi no contestó: el cobro pudo crearse igual. Se busca antes de
      // decir que falló, para que no lo vuelva a intentar y pague dos veces.
      tx = e instanceof WompiError && e.code === 'UNAVAILABLE' ? await this.api.transaccionPorReferencia(refCobro) : null
      if (!tx) {
        // No se cobró nada: se suelta el turno para que pueda reintentar ya.
        await this.prisma.paymentIntent.update({
          where: { id: intent.id },
          data: { paymentStartedAt: null, status: estadoPrevio },
        })
        throw this.errorParaElCliente(e)
      }
      this.log.warn(`[pago] Wompi no contestó pero el cobro ${refCobro} sí se creó (${tx.id})`)
    }

    intent = await this.prisma.paymentIntent.update({
      where: { id: intent.id },
      data: { wompiId: tx.id, status: 'PENDING', wompiMethod: datos.metodo },
    })
    this.log.log(`[pago] ${refCobro} ${datos.metodo} → ${tx.id} ${tx.status}`)
    if (tx.status !== 'PENDING') {
      await this.wompi.finalizeTransaction(tx, 'pago-directo')
      intent = (await this.prisma.paymentIntent.findUnique({ where: { id: intent.id } }))!
    }
    return this.respuesta(intent, tx)
  }

  /**
   * La reserva de franjas dura 20 minutos desde que eligió horario. Al pagar se
   * alarga: Nequi, el banco o el 3DS pueden tomar varios minutos. Si ya venció
   * mientras llenaba los datos, se vuelve a pedir con el mismo horario.
   */
  private async mantenerReserva(intent: PaymentIntent) {
    const hasta = new Date(Date.now() + RESERVA_AL_PAGAR_MIN * 60 * 1000)
    const r = await this.prisma.scheduleSlot.updateMany({
      where: { intentId: intent.id, status: 'pending' },
      data: { holdExpiresAt: hasta },
    })
    const horario = (Array.isArray(intent.scheduleJson) ? intent.scheduleJson : []) as unknown as SlotRef[]
    if (r.count > 0 || intent.esRenovacion || horario.length === 0) return
    try {
      const res = await this.slots.reserveForIntent(intent.id, horario, intent.userId ?? undefined)
      await this.prisma.paymentIntent.update({ where: { id: intent.id }, data: { assignmentMode: res.mode } })
      await this.prisma.scheduleSlot.updateMany({
        where: { intentId: intent.id, status: 'pending' },
        data: { holdExpiresAt: hasta },
      })
    } catch (e) {
      // Sin reserva igual se puede cobrar: al aprobarse, el horario se vuelve a
      // buscar (`materializePurchase`). Lo que no se hace es frenar el pago.
      this.log.warn(`[pago] no se pudo renovar la reserva de ${intent.reference}: ${(e as Error).message}`)
    }
  }

  /** `payment_method` de Wompi para cada medio, validando lo que manda el navegador. */
  private armarMedio(d: DatosDePago, intent: PaymentIntent, plan: string, redirectUrl: string) {
    const texto = `Freakn English ${plan}`
    switch (d.metodo) {
      case 'CARD': {
        if (!/^tok_(test|prod)_[A-Za-z0-9_-]+$/.test(String(d.token ?? ''))) {
          throw new BadRequestException('No pudimos leer la tarjeta. Escríbela de nuevo.')
        }
        if (!this.navegador(d.browserInfo)) throw new BadRequestException('Actualiza la página e intenta de nuevo.')
        const cuotas = Math.max(1, Math.min(36, Math.trunc(Number(d.cuotas) || 1)))
        return { type: 'CARD', token: d.token, installments: cuotas }
      }
      case 'NEQUI': {
        const cel = celularColombiano(d.telefono)
        if (!cel) throw new BadRequestException('Escribe el celular de tu Nequi: 10 dígitos, empieza por 3.')
        return { type: 'NEQUI', phone_number: cel }
      }
      case 'PSE': {
        const banco = String(d.banco ?? '').trim()
        if (!/^\d{1,5}$/.test(banco) || /^0+$/.test(banco)) throw new BadRequestException('Elige tu banco.')
        const tipo = String(d.tipoDocumento ?? 'CC').toUpperCase()
        if (!DOCUMENTOS_PSE.includes(tipo)) throw new BadRequestException('Elige el tipo de documento.')
        const doc = String(d.documento ?? '').replace(/[^0-9A-Za-z-]/g, '')
        if (doc.length < 5 || doc.length > 20) throw new BadRequestException('Revisa el número de documento.')
        if (!celularColombiano(d.telefono ?? intent.customerPhone)) {
          throw new BadRequestException('PSE pide un celular colombiano de 10 dígitos.')
        }
        return {
          type: 'PSE',
          user_type: d.tipoPersona === 1 ? 1 : 0,
          user_legal_id_type: tipo,
          user_legal_id: doc,
          financial_institution_code: banco,
          payment_description: descripcion(texto, 64),
        }
      }
      case 'BANCOLOMBIA_TRANSFER':
        return {
          type: 'BANCOLOMBIA_TRANSFER',
          user_type: 'PERSON',
          payment_description: descripcion(texto, 64),
          ecommerce_url: redirectUrl,
        }
      case 'DAVIPLATA': {
        const tipo = String(d.tipoDocumento ?? 'CC').toUpperCase()
        if (!DOCUMENTOS_DAVIPLATA.includes(tipo)) throw new BadRequestException('Elige el tipo de documento.')
        const doc = String(d.documento ?? '').replace(/[^0-9A-Za-z-]/g, '')
        if (doc.length < 5 || doc.length > 20) throw new BadRequestException('Revisa el número de documento.')
        return {
          type: 'DAVIPLATA',
          user_legal_id_type: tipo,
          user_legal_id: doc,
          payment_description: descripcion(texto, 30),
        }
      }
    }
  }

  /** `customer_data`: nombre, celular colombiano si lo hay, documento en PSE y Daviplata. */
  private armarCliente(d: DatosDePago, intent: PaymentIntent) {
    const cel = celularColombiano(d.telefono) ?? celularColombiano(intent.customerPhone)
    const conDocumento = d.metodo === 'PSE' || d.metodo === 'DAVIPLATA'
    const browser = d.metodo === 'CARD' ? this.navegador(d.browserInfo) : null
    return {
      full_name: intent.customerName.slice(0, 100),
      ...(cel ? { phone_number: cel } : {}),
      ...(conDocumento
        ? {
            legal_id: String(d.documento ?? '').replace(/[^0-9A-Za-z-]/g, ''),
            legal_id_type: String(d.tipoDocumento ?? 'CC').toUpperCase(),
          }
        : {}),
      ...(d.deviceId ? { device_id: String(d.deviceId).slice(0, 200) } : {}),
      ...(browser ? { browser_info: browser } : {}),
    }
  }

  /** Los seis datos del navegador que pide el 3D Secure, como texto. */
  private navegador(info?: Record<string, unknown>): Record<string, string> | null {
    if (!info || typeof info !== 'object') return null
    const out: Record<string, string> = {}
    for (const k of CAMPOS_NAVEGADOR) {
      const v = info[k]
      if (v === undefined || v === null || v === '') return null
      out[k] = String(v).slice(0, 300)
    }
    return out
  }

  /** Error de Wompi convertido en algo que la persona pueda resolver. */
  private errorParaElCliente(e: unknown) {
    if (!(e instanceof WompiError)) return e instanceof Error ? e : new Error(String(e))
    if (e.code === 'METHOD_NOT_ENABLED') return new BadRequestException(e.message)
    if (e.code === 'REJECTED') {
      const detalle = e.campos ? Object.values(e.campos).flat().join(' ') : ''
      return new BadRequestException(detalle ? `Wompi rechazó los datos: ${detalle}` : e.message)
    }
    if (e.code === 'AUTH') return new ServiceUnavailableException('Los pagos no están disponibles en este momento.')
    return new ServiceUnavailableException('El procesador de pagos no responde. Intenta de nuevo en un momento.')
  }
}
