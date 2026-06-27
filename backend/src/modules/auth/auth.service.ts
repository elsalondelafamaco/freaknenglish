import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as argon2 from 'argon2'
import * as crypto from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { env } from '../../config/env'

/** Token pair returned to the client. */
export type Tokens = { accessToken: string; refreshToken: string }

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async signup(input: { email: string; password: string; fullName: string; phone?: string }) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } })
    if (existing) throw new ConflictException('Email already registered')
    const passwordHash = await argon2.hash(input.password)
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        phone: input.phone,
        role: 'student',
      },
    })
    return this.issueTokens(user)
  }

  async login(email: string, password: string): Promise<Tokens & { user: { id: string; role: string } }> {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials')
    const ok = await argon2.verify(user.passwordHash, password)
    if (!ok) throw new UnauthorizedException('Invalid credentials')
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
    return this.issueTokens(user)
  }

  async logout(refreshToken: string) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
    await this.prisma.refreshToken
      .update({ where: { tokenHash }, data: { revokedAt: new Date() } })
      .catch(() => undefined)
  }

  async forgotPassword(email: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user) return null
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    await this.prisma.passwordReset.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    })
    // TODO: send email via NotificationService
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
