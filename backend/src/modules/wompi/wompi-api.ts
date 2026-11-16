import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { env } from '../../config/env'

/**
 * Cliente de la API de Wompi para el cobro DIRECTO (dentro del sitio, sin la
 * pasarela). La pasarela de siempre sigue en `checkout.service.ts` y es la que
 * se usa mientras esto no esté encendido.
 *
 * Reglas que vienen de las dos integraciones que ya corren (jumpnext y
 * famaticket), y que costaron encontrar:
 * - Los tokens de aceptación son de UN SOLO USO: se piden frescos para cada
 *   transacción, nunca se cachean.
 * - La transacción se crea en el servidor con la llave PRIVADA. El número de la
 *   tarjeta se tokeniza en el navegador con la pública y nunca pasa por aquí.
 * - En producción cada medio se activa por separado; uno sin activar responde
 *   404 "identidad de pago".
 * - La lista de bancos de PSE trae un banco falso "0" ("A continuación
 *   seleccione su banco") que hay que quitar.
 * - Mezclar llaves de prueba y de producción hace fallar los pagos en silencio.
 */

/** Medios que el sitio sabe cobrar. Wompi dice cuáles tiene activos el comercio. */
export const MEDIOS_SOPORTADOS = ['CARD', 'NEQUI', 'PSE', 'BANCOLOMBIA_TRANSFER', 'DAVIPLATA'] as const
export type MedioDePago = (typeof MEDIOS_SOPORTADOS)[number]

export type EstadoWompi = 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING'

export type TransaccionWompi = {
  id: string
  reference: string
  status: EstadoWompi
  amount_in_cents: number
  currency: string
  customer_email: string
  payment_method_type?: string
  status_message?: string | null
  payment_method?: { type?: string; extra?: any }
}

export type CodigoErrorWompi = 'ACCEPTANCE_EXPIRED' | 'REJECTED' | 'METHOD_NOT_ENABLED' | 'AUTH' | 'UNAVAILABLE'

export class WompiError extends Error {
  constructor(
    message: string,
    readonly code: CodigoErrorWompi,
    readonly campos?: Record<string, string[]>,
  ) {
    super(message)
  }
}

export type InfoComercio = {
  terminosUrl: string
  datosUrl: string
  mediosActivos: MedioDePago[]
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

/** `test` o `prod` según el prefijo de cada llave de Wompi; `null` si no se reconoce. */
export function ambienteDeLlave(llave: string): 'test' | 'prod' | null {
  const m = /^(?:pub_|prv_)?(test|prod)_/.exec(llave ?? '')
  return m ? (m[1] as 'test' | 'prod') : null
}

/**
 * ¿Se puede cobrar directo? Las cuatro llaves tienen que estar y ser del mismo
 * ambiente que `WOMPI_ENV`. Devuelve el motivo cuando no, para el log.
 */
export function configuracionDirecta(): { ok: true } | { ok: false; motivo: string } {
  const llaves = {
    WOMPI_PUBLIC_KEY: env.WOMPI_PUBLIC_KEY,
    WOMPI_PRIVATE_KEY: env.WOMPI_PRIVATE_KEY,
    WOMPI_INTEGRITY_SECRET: env.WOMPI_INTEGRITY_SECRET,
    WOMPI_EVENTS_SECRET: env.WOMPI_EVENTS_SECRET,
  }
  const faltan = Object.entries(llaves).filter(([, v]) => !v).map(([k]) => k)
  if (faltan.length) return { ok: false, motivo: `faltan ${faltan.join(', ')}` }
  const esperado = env.WOMPI_ENV === 'production' ? 'prod' : 'test'
  const distintas = Object.entries(llaves).filter(([, v]) => ambienteDeLlave(v) !== esperado).map(([k]) => k)
  if (distintas.length) {
    return { ok: false, motivo: `${distintas.join(', ')} no son de ${env.WOMPI_ENV} (WOMPI_ENV)` }
  }
  return { ok: true }
}

/** Firma de integridad de una transacción: sha256(referencia + centavos + moneda + secreto). */
export function firmaDeIntegridad(reference: string, amountInCents: number, currency = 'COP'): string {
  return sha256(`${reference}${amountInCents}${currency}${env.WOMPI_INTEGRITY_SECRET}`)
}

/** Lo que el navegador tiene que hacer después de crear la transacción. */
export function siguientePaso(tx: TransaccionWompi | null) {
  const extra = tx?.payment_method?.extra ?? {}
  const tds = extra.three_ds_auth
  return {
    // PSE y Bancolombia: hay que ir al banco.
    irAlBanco: (extra.async_payment_url as string | undefined) ?? null,
    // Tarjeta con reto 3D Secure: HTML del banco para mostrar en un iframe.
    tresDs:
      tds?.current_step === 'CHALLENGE' && tds?.three_ds_method_data ? (tds.three_ds_method_data as string) : null,
    // Daviplata: código por SMS, con URLs propias de Wompi.
    otp: extra.url_services?.token
      ? {
          token: extra.url_services.token as string,
          enviar: extra.url_services.code_otp_send as string,
          validar: extra.url_services.code_otp_validate as string,
        }
      : null,
  }
}

const SEIS_HORAS = 6 * 60 * 60 * 1000
const DIEZ_MINUTOS = 10 * 60 * 1000

@Injectable()
export class WompiApi implements OnModuleInit {
  private readonly log = new Logger(WompiApi.name)
  private bancos: { cuando: number; lista: Array<{ codigo: string; nombre: string }> } | null = null
  private comercio: { cuando: number; info: InfoComercio } | null = null

  onModuleInit() {
    const c = configuracionDirecta()
    if (c.ok) this.log.log(`Cobro directo con Wompi ENCENDIDO (${env.WOMPI_ENV})`)
    else {
      // El cobro es directo siempre; si faltan llaves o están mezcladas, el
      // sitio sigue con la pasarela (que no necesita la llave privada) en vez
      // de romper el pago. Se grita para que se note en el log.
      this.log.error(`Cobro directo apagado: ${c.motivo}. Se usa la pasarela de Wompi.`)
    }
  }

  get base(): string {
    return env.WOMPI_ENV === 'production' ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1'
  }

  private async llamar<T>(
    ruta: string,
    opts: { method?: 'GET' | 'POST'; auth?: 'public' | 'private'; body?: unknown } = {},
  ): Promise<T> {
    const llave = opts.auth === 'private' ? env.WOMPI_PRIVATE_KEY : env.WOMPI_PUBLIC_KEY
    let res: Response
    try {
      res = await fetch(`${this.base}${ruta}`, {
        method: opts.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(opts.auth ? { Authorization: `Bearer ${llave}` } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(15_000),
      })
    } catch (e) {
      throw new WompiError('El procesador de pagos no responde.', 'UNAVAILABLE')
    }
    const json: any = await res.json().catch(() => ({}))
    if (res.ok) return json as T

    const err = json?.error ?? {}
    const campos: Record<string, string[]> | undefined =
      err.messages && typeof err.messages === 'object' ? err.messages : undefined
    if (res.status === 422) {
      if (campos && ('acceptance_token' in campos || 'accept_personal_auth' in campos)) {
        throw new WompiError('Los términos de pago vencieron.', 'ACCEPTANCE_EXPIRED', campos)
      }
      throw new WompiError(err.reason || 'Revisa los datos del pago.', 'REJECTED', campos)
    }
    if (res.status === 404 && err.type === 'NOT_FOUND_ERROR' && /identidad de pago/i.test(err.reason ?? '')) {
      throw new WompiError('Este medio de pago no está disponible ahora mismo. Elige otro.', 'METHOD_NOT_ENABLED')
    }
    if (res.status === 401 || res.status === 403) {
      this.log.error(`Wompi rechazó las llaves (${res.status}) en ${ruta}: ${JSON.stringify(err).slice(0, 300)}`)
      throw new WompiError('Pagos mal configurados.', 'AUTH')
    }
    this.log.warn(`Wompi ${res.status} en ${ruta}: ${JSON.stringify(json).slice(0, 300)}`)
    throw new WompiError('El procesador de pagos no está disponible.', 'UNAVAILABLE')
  }

  /**
   * Enlaces de términos y medios activos del comercio. Se cachea 10 minutos:
   * es lo que se MUESTRA. Los tokens para cobrar salen siempre de `tokensFrescos`.
   */
  async infoComercio(): Promise<InfoComercio> {
    if (this.comercio && Date.now() - this.comercio.cuando < DIEZ_MINUTOS) return this.comercio.info
    const r = await this.llamar<any>(`/merchants/${env.WOMPI_PUBLIC_KEY}`)
    const d = r?.data ?? {}
    const aceptados = new Set<string>(Array.isArray(d.accepted_payment_methods) ? d.accepted_payment_methods : [])
    const info: InfoComercio = {
      terminosUrl: d.presigned_acceptance?.permalink ?? '',
      datosUrl: d.presigned_personal_data_auth?.permalink ?? '',
      mediosActivos: MEDIOS_SOPORTADOS.filter((m) => aceptados.has(m)),
    }
    this.comercio = { cuando: Date.now(), info }
    return info
  }

  /** Tokens de aceptación de un solo uso, pedidos en el momento de cobrar. */
  private async tokensFrescos(): Promise<{ aceptacion: string; datos: string }> {
    const r = await this.llamar<any>(`/merchants/${env.WOMPI_PUBLIC_KEY}`)
    const aceptacion = r?.data?.presigned_acceptance?.acceptance_token
    if (!aceptacion) throw new WompiError('No se pudieron obtener los términos de pago.', 'UNAVAILABLE')
    return { aceptacion, datos: r?.data?.presigned_personal_data_auth?.acceptance_token ?? aceptacion }
  }

  /** Bancos de PSE, sin el banco falso "0". Se cachea 6 horas. */
  async bancosPse(): Promise<Array<{ codigo: string; nombre: string }>> {
    if (this.bancos && Date.now() - this.bancos.cuando < SEIS_HORAS) return this.bancos.lista
    const r = await this.llamar<any>('/pse/financial_institutions', { auth: 'public' })
    const lista = (Array.isArray(r?.data) ? r.data : [])
      .map((b: any) => ({ codigo: String(b.financial_institution_code ?? '').trim(), nombre: String(b.financial_institution_name ?? '').trim() }))
      .filter((b: { codigo: string; nombre: string }) => b.codigo && !/^0+$/.test(b.codigo) && !/seleccione/i.test(b.nombre))
    this.bancos = { cuando: Date.now(), lista }
    return lista
  }

  /**
   * Crea la transacción. Si los tokens de aceptación vencieron (422), los pide
   * de nuevo y reintenta UNA vez: un 422 garantiza que no se creó nada.
   *
   * Ante red caída o 5xx NO se reintenta: la transacción pudo crearse aunque la
   * respuesta no llegara. Quien llama busca por referencia antes de dar error.
   */
  async crearTransaccion(datos: {
    reference: string
    amountInCents: number
    email: string
    paymentMethod: Record<string, unknown>
    customerData: Record<string, unknown>
    redirectUrl: string
    ip?: string
    sessionId?: string
  }): Promise<TransaccionWompi> {
    const esTarjeta = datos.paymentMethod.type === 'CARD'
    const armar = (t: { aceptacion: string; datos: string }) => ({
      acceptance_token: t.aceptacion,
      accept_personal_auth: t.datos,
      amount_in_cents: datos.amountInCents,
      currency: 'COP',
      signature: firmaDeIntegridad(datos.reference, datos.amountInCents),
      customer_email: datos.email,
      reference: datos.reference,
      payment_method: datos.paymentMethod,
      redirect_url: datos.redirectUrl,
      customer_data: datos.customerData,
      ...(esTarjeta ? { is_three_ds: true } : {}),
      ...(datos.sessionId ? { session_id: datos.sessionId } : {}),
      ...(datos.ip ? { ip: datos.ip } : {}),
    })
    try {
      const r = await this.llamar<any>('/transactions', { method: 'POST', auth: 'private', body: armar(await this.tokensFrescos()) })
      return r.data as TransaccionWompi
    } catch (e) {
      if (!(e instanceof WompiError) || e.code !== 'ACCEPTANCE_EXPIRED') throw e
      const r = await this.llamar<any>('/transactions', { method: 'POST', auth: 'private', body: armar(await this.tokensFrescos()) })
      return r.data as TransaccionWompi
    }
  }

  /** Estado actual de una transacción, con lo que haga falta para el siguiente paso. */
  async transaccion(id: string): Promise<TransaccionWompi | null> {
    try {
      const r = await this.llamar<any>(`/transactions/${encodeURIComponent(id)}`, { auth: 'public' })
      return (r?.data as TransaccionWompi) ?? null
    } catch (e) {
      this.log.warn(`No se pudo consultar la transacción ${id}: ${(e as Error).message}`)
      return null
    }
  }

  /**
   * Transacción creada con una referencia, si existe. Es lo que se mira cuando
   * la creación se cortó (red, 5xx) antes de saber si Wompi alcanzó a cobrar.
   */
  async transaccionPorReferencia(reference: string): Promise<TransaccionWompi | null> {
    try {
      const r = await this.llamar<any>(`/transactions?reference=${encodeURIComponent(reference)}`, { auth: 'private' })
      const lista: TransaccionWompi[] = Array.isArray(r?.data) ? r.data : []
      return lista.find((t) => t.reference === reference) ?? null
    } catch (e) {
      this.log.warn(`No se pudo buscar la transacción ${reference}: ${(e as Error).message}`)
      return null
    }
  }
}
