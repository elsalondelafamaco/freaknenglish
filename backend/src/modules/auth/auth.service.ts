import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as argon2 from 'argon2'
import * as crypto from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { env } from '../../config/env'

/** Token pair returned to the client. */
export type Tokens = { accessToken: string; refreshToken: string }

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
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    await this.prisma.passwordReset.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    })
    const link = `${env.PUBLIC_SITE_URL}/reset-password?token=${token}`
    await this.notifications.enqueue({
      userId: user.id,
      toEmail: user.email,
      template: 'password_reset',
      subject: 'Restablece tu contraseña',
      dedupeKey: `pwreset:${user.id}:${token.slice(0, 12)}`,
      vars: { link },
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
    return { accessToken, refreshToken }
  }
}
