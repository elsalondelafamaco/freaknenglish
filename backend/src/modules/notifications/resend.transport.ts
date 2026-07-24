import { Injectable, Logger } from '@nestjs/common'
import { Resend } from 'resend'
import { env } from '../../config/env'

@Injectable()
export class ResendTransport {
  private readonly log = new Logger(ResendTransport.name)
  private client: Resend | null = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

  async send(input: { to: string; subject: string; html: string }) {
    if (!this.client) {
      this.log.warn(`[no-resend-key] would send email to ${input.to}: ${input.subject}`)
      return { id: `mock-${Date.now()}` }
    }
    const res = await this.client.emails.send({
      from: env.RESEND_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(env.RESEND_REPLY_TO ? { replyTo: env.RESEND_REPLY_TO } : {}),
    })
    if (res.error) throw new Error(res.error.message)
    return { id: res.data?.id ?? 'unknown' }
  }
}
