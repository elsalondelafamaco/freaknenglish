import { Injectable, Logger } from '@nestjs/common'
import { env } from '../../config/env'

/**
 * Andamiaje del canal WhatsApp — LISTO pero NO FUNCIONAL por decisión de
 * producto. Mientras `WHATSAPP_ENABLED=false` (default) solo registra en logs
 * y no envía nada. Cuando se habilite, implementar aquí el envío real:
 *   - Cloud API (Meta): POST https://graph.facebook.com/v20.0/{PHONE_ID}/messages
 *   - Twilio:           POST https://api.twilio.com/.../Messages.json
 * El resto del sistema (routing por `channel`, persistencia en `notifications`)
 * ya está cableado, así que activar el canal es solo completar este `send()`.
 */
@Injectable()
export class WhatsAppTransport {
  private readonly log = new Logger(WhatsAppTransport.name)

  get enabled(): boolean {
    return env.WHATSAPP_ENABLED && !!env.WHATSAPP_API_TOKEN
  }

  async send(input: { to: string; body: string }): Promise<{ id: string }> {
    if (!this.enabled) {
      this.log.warn(`[whatsapp-disabled] no-op → ${input.to}: ${input.body.slice(0, 60)}`)
      return { id: `wa-noop-${Date.now()}` }
    }
    // TODO(whatsapp): implementar envío real cuando el producto lo habilite.
    this.log.warn('[whatsapp] habilitado pero el envío real aún no está implementado')
    return { id: `wa-pending-${Date.now()}` }
  }
}
