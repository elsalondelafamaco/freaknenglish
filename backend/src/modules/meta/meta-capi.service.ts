import { Injectable, Logger } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { env } from '../../config/env'
import { normalizarEmail } from '../../common/email'

/** Versión de la Graph API. Vigente desde julio de 2026; Meta la sostiene ~2 años. */
const GRAPH_VERSION = 'v26.0'

/** Lo que hace falta de un intento de pago para reportarlo como compra. */
export type CompraParaMeta = {
  reference: string
  planId: string
  amountInCents: number
  currency: string
  esRenovacion: boolean
  customerEmail: string
  customerPhone?: string | null
  userId?: string | null
  fbp?: string | null
  fbc?: string | null
  clientIp?: string | null
  clientUserAgent?: string | null
  eventSourceUrl?: string | null
  approvedAt?: Date | null
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

/**
 * Teléfono como lo pide Meta antes del hash: solo dígitos, sin ceros a la
 * izquierda y CON indicativo de país. Sin indicativo no sirve para cruzar.
 *
 * Casi todos los alumnos escriben su celular colombiano a secas ("300 123
 * 4567"): 10 dígitos que empiezan por 3. Esos se completan con el 57. Uno que ya
 * trae indicativo (de otro país o el +57) se deja como viene.
 */
export function normalizarTelefono(telefono?: string | null): string | null {
  if (!telefono) return null
  const digitos = telefono.replace(/\D/g, '').replace(/^0+/, '')
  if (!digitos) return null
  if (digitos.length === 10 && digitos.startsWith('3')) return `57${digitos}`
  return digitos
}

/** El cuerpo del evento, aparte para poder probarlo sin mandar nada. */
export function armarEventoDeCompra(c: CompraParaMeta) {
  const telefono = normalizarTelefono(c.customerPhone)
  const user_data: Record<string, unknown> = {
    // Sin espacios y en minúscula, que es lo mismo que pide Meta antes del hash.
    em: [sha256(normalizarEmail(c.customerEmail))],
    ...(telefono ? { ph: [sha256(telefono)] } : {}),
    // El id de la cuenta, hasheado: si algún día se manda también desde otro
    // canal, Meta junta los eventos de la misma persona.
    ...(c.userId ? { external_id: [sha256(c.userId)] } : {}),
    // Estos NO se hashean nunca: Meta los rechaza hasheados.
    ...(c.clientIp ? { client_ip_address: c.clientIp } : {}),
    ...(c.clientUserAgent ? { client_user_agent: c.clientUserAgent } : {}),
    ...(c.fbp ? { fbp: c.fbp } : {}),
    ...(c.fbc ? { fbc: c.fbc } : {}),
  }
  return {
    event_name: 'Purchase',
    event_time: Math.floor((c.approvedAt ?? new Date()).getTime() / 1000),
    // El mismo id que manda el píxel del navegador al volver de Wompi: así Meta
    // cuenta UNA compra aunque le llegue por los dos lados.
    event_id: c.reference,
    action_source: 'website',
    ...(c.eventSourceUrl ? { event_source_url: c.eventSourceUrl } : {}),
    user_data,
    custom_data: {
      // Lo cobrado de verdad, en COP: el plan cuesta en USD pero se cobra con la
      // TRM del momento, y eso es lo que entró.
      value: c.amountInCents / 100,
      currency: c.currency,
      content_ids: [c.planId],
      content_type: 'product',
      content_category: c.esRenovacion ? 'renovacion' : 'plan_nuevo',
    },
  }
}

/**
 * API de Conversiones de Meta: reporta las compras desde el servidor.
 *
 * El pago ocurre en la página de Wompi, y no todos vuelven al sitio después
 * (cierran la pestaña, o un bloqueador apaga el píxel). Sin esto, esas compras
 * no existían para Meta, que optimizaba las campañas con datos incompletos.
 */
@Injectable()
export class MetaCapiService {
  private readonly log = new Logger(MetaCapiService.name)

  get activo(): boolean {
    return !!env.META_PIXEL_ID && !!env.META_CAPI_TOKEN
  }

  /**
   * Manda una compra. NUNCA lanza: un fallo de Meta se registra y ya, porque
   * esto corre en medio de la activación del plan y no puede romperla.
   */
  async reportarCompra(c: CompraParaMeta): Promise<void> {
    if (!this.activo) return
    try {
      const cuerpo = {
        data: [armarEventoDeCompra(c)],
        ...(env.META_TEST_EVENT_CODE ? { test_event_code: env.META_TEST_EVENT_CODE } : {}),
      }
      const url = `https://graph.facebook.com/${GRAPH_VERSION}/${env.META_PIXEL_ID}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN)}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      if (!res.ok) {
        const detalle = await res.text().catch(() => '')
        this.log.error(`Compra ${c.reference} no llegó a Meta: ${res.status} ${detalle.slice(0, 300)}`)
        return
      }
      this.log.log(`Compra ${c.reference} reportada a Meta${env.META_TEST_EVENT_CODE ? ' (modo prueba)' : ''}`)
    } catch (e) {
      this.log.error(`Compra ${c.reference} no llegó a Meta: ${(e as Error).message}`)
    }
  }
}
