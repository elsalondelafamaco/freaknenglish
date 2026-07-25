import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * Contenido premium (board, aprendizaje, calendario, clases): los estudiantes
 * necesitan suscripción ACTIVA. Teachers y admins pasan siempre.
 *
 * 403 con code `subscription_required` — el storefront manda al dashboard
 * a elegir plan.
 */
@Injectable()
export class ActiveSubscriptionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest()
    const u = req?.user as { id?: string; role?: string } | undefined
    if (!u?.id) return true // JwtAuthGuard ya rechazó si la ruta exige auth
    if (u.role !== 'student') return true

    const sub = await this.prisma.subscription.findUnique({
      where: { userId: u.id },
      select: { status: true, currentPeriodEnd: true },
    })
    const active = !!sub && sub.status === 'active'
    if (!active) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Necesitas una suscripción activa para acceder a este contenido.',
        code: 'subscription_required',
      })
    }
    return true
  }
}
