import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { ForgotPasswordDto, LoginDto, ResetPasswordDto, SignupDto } from './dto/auth.dto'
import { env } from '../../config/env'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  /** @endpoint POST /api/v1/auth/signup */
  @Post('signup')
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.signup(dto)
    this.setRefreshCookie(res, tokens.refreshToken)
    return { accessToken: tokens.accessToken }
  }

  /** @endpoint POST /api/v1/auth/login */
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, user } = await this.auth.login(dto.email, dto.password)
    this.setRefreshCookie(res, refreshToken)
    return { accessToken, user }
  }

  /** @endpoint POST /api/v1/auth/refresh */
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rt = req.cookies?.refresh_token
    const tokens = await this.auth.refresh(rt)
    this.setRefreshCookie(res, tokens.refreshToken)
    return { accessToken: tokens.accessToken }
  }

  /** @endpoint POST /api/v1/auth/logout */
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (req.cookies?.refresh_token) await this.auth.logout(req.cookies.refresh_token)
    res.clearCookie('refresh_token')
    return { ok: true }
  }

  /** @endpoint POST /api/v1/auth/forgot */
  @Post('forgot')
  async forgot(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email)
    return { ok: true }
  }

  /** @endpoint POST /api/v1/auth/reset */
  @Post('reset')
  async reset(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password)
    return { ok: true }
  }

  /** @endpoint GET /api/v1/auth/google */
  @Get('google')
  @UseGuards(AuthGuard('google'))
  google() { /* redirect handled by passport */ }

  /** @endpoint GET /api/v1/auth/google/callback */
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const profile = req.user as any
    const tokens = await this.auth.loginOrCreateGoogle(profile)
    this.setRefreshCookie(res, tokens.refreshToken)
    res.redirect(`${env.PUBLIC_SITE_URL}/auth/callback?token=${tokens.accessToken}`)
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    })
  }
}
