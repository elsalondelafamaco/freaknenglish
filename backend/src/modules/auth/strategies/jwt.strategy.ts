import { ForbiddenException, Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { env } from '../../../config/env'
import { PrismaService } from '../../../prisma/prisma.service'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.JWT_SECRET,
    })
  }

  /**
   * Además de validar el JWT, verifica contra DB que la cuenta siga viva:
   * un usuario baneado (disabledAt) o eliminado pierde acceso inmediato en
   * TODA la API aunque su access token siga vigente.
   */
  async validate(payload: { sub: string; email: string; role: string; impersonatorId?: string; actAs?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { disabledAt: true, deletedAt: true, role: true },
    })
    if (!user || user.disabledAt || user.deletedAt) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Tu cuenta está bloqueada. Contacta a soporte.',
        code: 'account_banned',
      })
    }
    return {
      id: payload.sub,
      email: payload.email,
      // Rol desde DB: si el admin cambió el rol, aplica sin esperar re-login.
      role: user.role,
      impersonatorId: payload.impersonatorId ?? null,
    }
  }
}
