import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ResendTransport } from './resend.transport'
import { templates, TemplateKey } from './templates'

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name)
  constructor(private prisma: PrismaService, private transport: ResendTransport) {}

  /**
   * Enqueue (or upsert) a notification by dedupeKey, then attempt delivery.
   * dedupeKey makes this idempotent across cron job retries.
   */
  async enqueue(input: {
    userId?: string
    toEmail: string
    template: TemplateKey
    subject: string
    dedupeKey: string
    vars?: Record<string, unknown>
  }) {
    const existing = await this.prisma.notification.findUnique({ where: { dedupeKey: input.dedupeKey } })
    if (existing && existing.status === 'sent') return existing

    const record =
      existing ??
      (await this.prisma.notification.create({
        data: {
          userId: input.userId,
          toEmail: input.toEmail,
          template: input.template,
          subject: input.subject,
          dedupeKey: input.dedupeKey,
          vars: input.vars ?? {},
        },
      }))

    try {
      const renderer = templates[input.template] as (v: any) => string
      const html = renderer(input.vars ?? {})
      const res = await this.transport.send({ to: input.toEmail, subject: input.subject, html })
      return this.prisma.notification.update({
        where: { id: record.id },
        data: { status: 'sent', sentAt: new Date(), providerId: res.id },
      })
    } catch (e) {
      this.log.error(e)
      return this.prisma.notification.update({
        where: { id: record.id },
        data: { status: 'failed', error: (e as Error).message },
      })
    }
  }
}
