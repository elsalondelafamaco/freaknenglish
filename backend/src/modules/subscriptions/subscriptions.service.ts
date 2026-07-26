import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { SubscriptionStatus } from '@prisma/client'

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Activate / extend a subscription after Wompi APPROVED.
   *
   * El mes NO empieza a correr mientras el estudiante no tenga profesor
   * asignado: sería cobrarle días en los que no puede tomar clases. En ese
   * caso la suscripción queda `active` (ya tiene acceso a la plataforma) pero
   * con `startedAt`/`currentPeriodEnd` en null; el reloj arranca en
   * `startPeriodOnTeacherAssigned`, al asignarle profe.
   */
  async activateForUser(userId: string, planId: string) {
    const now = new Date()
    const [existing, user] = await Promise.all([
      this.prisma.subscription.findUnique({ where: { userId } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { assignedTeacherId: true } }),
    ])
    const tieneProfe = !!user?.assignedTeacherId

    if (!tieneProfe) {
      const data = {
        status: SubscriptionStatus.active,
        planId,
        startedAt: null,
        currentPeriodEnd: null,
        canceledAt: null,
        cancelAt: null,
      }
      return this.prisma.subscription.upsert({
        where: { userId },
        update: data,
        create: { userId, ...data },
      })
    }

    // Renovación anticipada: el nuevo mes se concatena al período vigente.
    const base =
      existing?.status === 'active' && existing.currentPeriodEnd && existing.currentPeriodEnd > now
        ? existing.currentPeriodEnd
        : now
    const nextPeriodEnd = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000)
    return this.prisma.subscription.upsert({
      where: { userId },
      update: { status: SubscriptionStatus.active, planId, startedAt: now, currentPeriodEnd: nextPeriodEnd, canceledAt: null, cancelAt: null },
      create: { userId, planId, status: SubscriptionStatus.active, startedAt: now, currentPeriodEnd: nextPeriodEnd },
    })
  }

  /**
   * Arranca el mes de una suscripción que estaba esperando profesor. Se llama
   * al asignar profe (automático o manual). Idempotente: si el período ya
   * estaba corriendo no lo toca, para no regalar ni quitar días.
   */
  async startPeriodOnTeacherAssigned(userId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { userId } })
    if (!sub || sub.status !== SubscriptionStatus.active) return null
    if (sub.currentPeriodEnd) return sub // ya estaba corriendo
    const now = new Date()
    return this.prisma.subscription.update({
      where: { userId },
      data: { startedAt: now, currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) },
    })
  }

  cancel(userId: string) {
    return this.prisma.subscription.update({
      where: { userId },
      data: { status: SubscriptionStatus.canceled, canceledAt: new Date() },
    })
  }

  resume(userId: string) {
    return this.prisma.subscription.update({
      where: { userId },
      data: { status: SubscriptionStatus.active, canceledAt: null, cancelAt: null },
    })
  }

  mine(userId: string) {
    return this.prisma.subscription.findUnique({ where: { userId }, include: { plan: true } })
  }
}
