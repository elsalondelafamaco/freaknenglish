import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { SubscriptionStatus } from '@prisma/client'

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  /** Activate / extend a subscription after Wompi APPROVED. */
  async activateForUser(userId: string, planId: string) {
    const now = new Date()
    // Renovación anticipada: el nuevo mes se concatena al período vigente.
    const existing = await this.prisma.subscription.findUnique({ where: { userId } })
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
