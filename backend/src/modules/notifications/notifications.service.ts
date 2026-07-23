import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { ResendTransport } from './resend.transport'
import { WhatsAppTransport } from './whatsapp.transport'
import { templates, TemplateKey } from './templates'

export type NotificationChannel = 'email' | 'whatsapp' | 'in_app'

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name)
  constructor(
    private prisma: PrismaService,
    private transport: ResendTransport,
    private whatsapp: WhatsAppTransport,
  ) {}

  /**
   * Enqueue (or upsert) a notification by dedupeKey, then attempt delivery.
   * dedupeKey makes this idempotent across cron job retries.
   * `channel` enruta el envío: 'email' (Resend), 'whatsapp' (andamiaje) o
   * 'in_app' (solo bandeja, sin transporte externo).
   */
  async enqueue(input: {
    userId?: string
    toEmail: string
    toPhone?: string
    template: TemplateKey
    subject: string
    dedupeKey: string
    vars?: Prisma.InputJsonObject
    channel?: NotificationChannel
    // in-app fields (bell)
    type?: 'system' | 'payment' | 'class' | 'teacher' | 'learning'
    title?: string
    body?: string
    linkUrl?: string
    // if true, only store in-app (skip external transport)
    inAppOnly?: boolean
  }) {
    const channel: NotificationChannel = input.channel ?? 'email'
    const existing = await this.prisma.notification.findUnique({ where: { dedupeKey: input.dedupeKey } })
    if (existing && existing.status === 'sent') return existing

    const record =
      existing ??
      (await this.prisma.notification.create({
        data: {
          userId: input.userId,
          toEmail: input.toEmail,
          channel,
          template: input.template,
          subject: input.subject,
          dedupeKey: input.dedupeKey,
          vars: input.vars ?? {},
          type: input.type ?? 'system',
          title: input.title ?? input.subject,
          body: input.body,
          linkUrl: input.linkUrl,
        },
      }))

    if (input.inAppOnly || channel === 'in_app') {
      return this.prisma.notification.update({
        where: { id: record.id },
        data: { status: 'sent', sentAt: new Date() },
      })
    }

    try {
      let providerId: string
      if (channel === 'whatsapp') {
        const text = input.body ?? input.subject
        const res = await this.whatsapp.send({ to: input.toPhone ?? input.toEmail, body: text })
        providerId = res.id
      } else {
        const renderer = templates[input.template] as (v: any) => string
        const html = renderer(input.vars ?? {})
        const res = await this.transport.send({ to: input.toEmail, subject: input.subject, html })
        providerId = res.id
      }
      return this.prisma.notification.update({
        where: { id: record.id },
        data: { status: 'sent', sentAt: new Date(), providerId },
      })
    } catch (e) {
      this.log.error(e)
      return this.prisma.notification.update({
        where: { id: record.id },
        data: { status: 'failed', error: (e as Error).message },
      })
    }
  }

  // ─── In-app inbox ───────────────────────────────────────────────

  listForUser(userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(opts.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.limit ?? 50, 200),
      select: {
        id: true, type: true, template: true, title: true, body: true,
        linkUrl: true, subject: true, readAt: true, createdAt: true,
      },
    })
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } })
  }

  async markRead(userId: string, id: string) {
    const n = await this.prisma.notification.findFirst({ where: { id, userId } })
    if (!n) return { ok: false }
    if (n.readAt) return { ok: true }
    await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } })
    return { ok: true }
  }

  async markAllRead(userId: string) {
    const r = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    })
    return { ok: true, count: r.count }
  }
}
