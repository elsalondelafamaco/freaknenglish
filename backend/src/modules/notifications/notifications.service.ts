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

    // Cortafuegos de cuota: si algo se descontrola (un bucle, un ataque, una
    // automatización mal configurada), esto corta antes de agotar el plan de
    // Resend y de que el dominio quede marcado como spam. La notificación
    // queda registrada como `throttled` para poder auditarla y reenviarla.
    const excedido = await this.cuotaDiariaExcedida(input.toEmail)
    if (excedido) {
      this.log.error(
        `[cuota] envío frenado (${excedido}) → ${input.toEmail} plantilla=${input.template}`,
      )
      return this.prisma.notification.update({
        where: { id: record.id },
        data: { status: 'failed', error: `throttled: ${excedido}` },
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

  /**
   * Topes de envío. Devuelve el motivo si se excedió alguno, o null si se
   * puede enviar. Dos niveles:
   *   · por destinatario — nadie recibe más de 20 correos en 24 h
   *   · global de la plataforma — techo diario para proteger la cuota
   * Ambos configurables por env para poder subirlos cuando crezca la base.
   */
  private async cuotaDiariaExcedida(toEmail: string): Promise<string | null> {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const maxPorDestinatario = Number(process.env.MAIL_MAX_PER_RECIPIENT_24H ?? 20)
    const maxGlobal = Number(process.env.MAIL_MAX_GLOBAL_24H ?? 2000)

    const [delDestinatario, global] = await Promise.all([
      this.prisma.notification.count({
        where: { toEmail, status: 'sent', sentAt: { gt: desde }, channel: 'email' },
      }),
      this.prisma.notification.count({
        where: { status: 'sent', sentAt: { gt: desde }, channel: 'email' },
      }),
    ])
    if (delDestinatario >= maxPorDestinatario) {
      return `destinatario ${delDestinatario}/${maxPorDestinatario} en 24h`
    }
    if (global >= maxGlobal) return `global ${global}/${maxGlobal} en 24h`
    return null
  }

  // ─── Trazabilidad (admin) ───────────────────────────────────────
  /**
   * Listado global de notificaciones enviadas (email/whatsapp/in-app) con
   * filtros para rastrear qué le llegó a un usuario.
   */
  async adminList(opts: {
    q?: string
    template?: string
    status?: string
    channel?: string
    from?: Date
    to?: Date
    page?: number
    pageSize?: number
  }) {
    const where: Prisma.NotificationWhereInput = {
      ...(opts.q
        ? {
            OR: [
              { toEmail: { contains: opts.q, mode: 'insensitive' } },
              { subject: { contains: opts.q, mode: 'insensitive' } },
              { user: { fullName: { contains: opts.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(opts.template ? { template: opts.template } : {}),
      ...(opts.status ? { status: opts.status as any } : {}),
      ...(opts.channel ? { channel: opts.channel } : {}),
      ...(opts.from || opts.to
        ? { createdAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
        : {}),
    }
    const pageSize = Math.min(opts.pageSize ?? 50, 200)
    const page = Math.max(opts.page ?? 1, 1)
    const [total, items, byStatus] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, toEmail: true, channel: true, template: true, subject: true,
          status: true, error: true, sentAt: true, createdAt: true, readAt: true,
          type: true, providerId: true,
          user: { select: { id: true, fullName: true, role: true } },
        },
      }),
      this.prisma.notification.groupBy({ by: ['status'], where, _count: true }),
    ])
    return {
      total,
      page,
      pageSize,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      items,
    }
  }

  /** Plantillas distintas usadas (para el dropdown de filtro del admin). */
  async adminTemplates() {
    const rows = await this.prisma.notification.groupBy({ by: ['template'], _count: true })
    return rows.map((r) => ({ template: r.template, count: r._count })).sort((a, b) => b.count - a.count)
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
