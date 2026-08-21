import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as argon2 from 'argon2'
import * as crypto from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { env } from '../../config/env'
import { PASSWORD_RESET_TTL_MS, resetTtlMs, ttlLabel } from '../../common/password-reset-ttl'

/** Token pair returned to the client. */
export type Tokens = { accessToken: string; refreshToken: string; userId: string }

/**
 * Cuánto dura una suplantación antes de volver sola a la sesión del admin.
 *
 * Una hora: media se quedaba corta para revisar la cuenta de un profesor y
 * caducaba a media revisión, sin más aviso que volver a ser admin de golpe.
 * El vale sigue comprobándose en cada renovación (rol, baneos, que la sesión
 * siga siendo la del mismo admin), así que alargarlo no relaja esos controles
 * — sólo el plazo antes de tener que volver a entrar.
 */
export const IMPERSONATION_TTL = '1h'
export const IMPERSONATION_TTL_MS = 60 * 60 * 1000

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private notifications: NotificationsService,
  ) {}

  async signup(input: { email: string; password: string; fullName: string; phone: string; documentNumber: string }) {
    const email = input.email.trim().toLowerCase()
    const existing = await this.prisma.user.findUnique({ where: { email } })
    if (existing) throw new ConflictException('Email already registered')
    const passwordHash = await argon2.hash(input.password)
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: input.fullName,
        phone: input.phone,
        documentNumber: input.documentNumber,
        role: 'student',
      },
    })
    // Bienvenida de "cuenta creada, falta elegir plan". Comparte el namespace
    // de dedupe `welcome:<userId>` con la bienvenida post-pago: quien se
    // registra y luego paga recibe UNA sola bienvenida (esta), y del pago le
    // llega el correo de pago confirmado, no una segunda bienvenida.
    await this.notifications.enqueue({
      userId: user.id,
      toEmail: user.email,
      template: 'welcome_signup',
      subject: `¡Tu cuenta en ${env.BRAND_NAME} está lista!`,
      dedupeKey: `welcome:${user.id}`,
      vars: { fullName: user.fullName },
      type: 'system',
      title: '¡Bienvenido!',
      body: 'Elige tu plan para empezar tus clases.',
      linkUrl: '/#precios',
    })
    return this.issueTokens(user)
  }

  async login(email: string, password: string): Promise<Tokens & { user: { id: string; role: string } }> {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials')
    if (user.disabledAt || user.deletedAt) throw new UnauthorizedException('User disabled')
    const ok = await argon2.verify(user.passwordHash, password)
    if (!ok) throw new UnauthorizedException('Invalid credentials')
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    const tokens = await this.issueTokens(user)
    return { ...tokens, user: { id: user.id, role: user.role } }
  }

  async loginOrCreateGoogle(profile: { email: string; fullName: string; googleSub: string; avatarUrl?: string }) {
    let user = await this.prisma.user.findUnique({ where: { email: profile.email } })
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          fullName: profile.fullName,
          googleSub: profile.googleSub,
          avatarUrl: profile.avatarUrl,
          emailVerifiedAt: new Date(),
          role: 'student',
        },
      })
    } else if (!user.googleSub) {
      await this.prisma.user.update({ where: { id: user.id }, data: { googleSub: profile.googleSub } })
    }
    return this.issueTokens(user)
  }

  async refresh(refreshToken: string): Promise<Tokens> {
    let payload: { sub: string; tokenId: string }
    try {
      payload = this.jwt.verify(refreshToken, { secret: env.JWT_REFRESH_SECRET })
    } catch {
      throw new UnauthorizedException('Invalid refresh token')
    }
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } })
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token revoked or expired')
    }
    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } })
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } })
    // Baneado/eliminado: sin renovación de sesión.
    if (user.disabledAt || user.deletedAt) throw new UnauthorizedException('User disabled')
    return this.issueTokens(user)
  }

  async logout(refreshToken: string) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
    await this.prisma.refreshToken
      .update({ where: { tokenHash }, data: { revokedAt: new Date() } })
      .catch(() => undefined)
  }

  async forgotPassword(email: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    if (!user) return null

    // Tope POR CUENTA, no solo por IP: rotando IPs se podría inundar el buzón
    // de una persona y agotar la cuota de envíos. Máximo 3 solicitudes por
    // hora y 8 al día para el mismo usuario. Se responde igual (silencioso)
    // para no revelar si el correo existe ni si está limitado.
    const [ultimaHora, ultimoDia] = await Promise.all([
      this.prisma.passwordReset.count({
        where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
      }),
      this.prisma.passwordReset.count({
        where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
    ])
    if (ultimaHora >= 3 || ultimoDia >= 8) return null

    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    // Quien todavía no tiene contraseña está estrenando la cuenta: este enlace
    // hace de invitación y dura una semana. Con contraseña ya puesta es un
    // restablecimiento de verdad y sigue durando una hora.
    const ttlMs = resetTtlMs(!!user.passwordHash, PASSWORD_RESET_TTL_MS)
    await this.prisma.passwordReset.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + ttlMs) },
    })
    const link = `${env.PUBLIC_SITE_URL}/reset-password?token=${token}`
    await this.notifications.enqueue({
      userId: user.id,
      toEmail: user.email,
      template: 'password_reset',
      subject: 'Restablece tu contraseña',
      dedupeKey: `pwreset:${user.id}:${token.slice(0, 12)}`,
      vars: { link, expiryLabel: ttlLabel(ttlMs) },
      type: 'system',
    })
    return token
  }

  async resetPassword(token: string, password: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const reset = await this.prisma.passwordReset.findUnique({ where: { tokenHash } })
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new UnauthorizedException('Reset token invalid or expired')
    }
    const passwordHash = await argon2.hash(password)
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
      this.prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    ])
  }

  /**
   * Vale de suplantación: dice QUIÉN suplanta a QUIÉN, nada más.
   *
   * Va en cookie httpOnly aparte de la de sesión, que sigue siendo la del
   * admin. Antes la suplantación vivía sólo en un token en memoria del
   * navegador: al recargar la página, la app pedía sesión con la cookie del
   * admin y le devolvían la del admin — volvías a ser tú sin ningún aviso.
   *
   * Deliberadamente NO es un refresh token del suplantado: no da acceso por
   * sí solo. En cada renovación se comprueba contra la sesión real de quien
   * pide, así que el vale sin la cookie del admin no vale nada.
   */
  async signImpersonationTicket(adminId: string, targetId: string): Promise<string> {
    return this.jwt.signAsync(
      { imp: true, adminId, targetId },
      { secret: env.JWT_SECRET, expiresIn: IMPERSONATION_TTL },
    )
  }

  /**
   * Convierte el vale en un access token del suplantado, si sigue valiendo.
   *
   * `sessionUserId` es el dueño real de la cookie de sesión. Que tengan que
   * coincidir es lo que impide que un vale olvidado en el navegador sirva
   * para otra persona que inicie sesión después en el mismo equipo.
   */
  async accessTokenParaSuplantacion(vale: string, sessionUserId: string): Promise<string | null> {
    let datos: { imp?: boolean; adminId?: string; targetId?: string }
    try {
      datos = await this.jwt.verifyAsync(vale, { secret: env.JWT_SECRET })
    } catch {
      return null // caducado o manipulado: se sigue como la sesión de siempre
    }
    if (!datos?.imp || datos.adminId !== sessionUserId || !datos.targetId) return null

    const [admin, target] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: datos.adminId } }),
      this.prisma.user.findUnique({ where: { id: datos.targetId } }),
    ])
    // El rol se vuelve a mirar en cada renovación: si a alguien le quitan el
    // admin mientras está suplantando, deja de poder renovarla.
    const esAdmin = admin?.role === 'admin' || (admin?.extraRoles ?? []).includes('admin')
    if (!admin || !esAdmin || admin.disabledAt || admin.deletedAt) return null
    if (!target || target.disabledAt || target.deletedAt) return null

    return this.jwt.signAsync(
      { sub: target.id, email: target.email, role: target.role, impersonatorId: admin.id, actAs: target.id },
      { secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRES_IN },
    )
  }

  private async issueTokens(user: { id: string; email: string; role: string }): Promise<Tokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      { secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRES_IN },
    )
    const tokenId = crypto.randomUUID()
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, tokenId },
      { secret: env.JWT_REFRESH_SECRET, expiresIn: env.JWT_REFRESH_EXPIRES_IN },
    )
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
    return { accessToken, refreshToken, userId: user.id }
  }
}
