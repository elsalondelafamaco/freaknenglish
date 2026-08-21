import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Throttle } from '@nestjs/throttler'
import { ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { ForgotPasswordDto, LoginDto, ResetPasswordDto, SignupDto } from './dto/auth.dto'
import { env } from '../../config/env'
import { AUTH_COOKIE_PATH, IMPERSONATION_COOKIE, REFRESH_COOKIE } from './auth.cookies'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  /** @endpoint POST /api/v1/auth/signup */
  // Cada registro dispara un correo de bienvenida: 5/min por IP evita que un
  // bot cree cuentas en masa y queme la cuota de envíos.
  @Throttle({ auth: { ttl: 60_000, limit: 5 } })
  @Post('signup')
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.signup(dto)
    this.setRefreshCookie(res, tokens.refreshToken)
    return { accessToken: tokens.accessToken }
  }

  /** @endpoint POST /api/v1/auth/login */
  // Fuerza bruta: 5 intentos por minuto por IP.
  @Throttle({ auth: { ttl: 60_000, limit: 5 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, user } = await this.auth.login(dto.email, dto.password)
    this.setRefreshCookie(res, refreshToken)
    return { accessToken, user }
  }

  /**
   * @endpoint POST /api/v1/auth/refresh
   *
   * Si hay vale de suplantación vigente, devuelve el token del suplantado en
   * vez del propio. La cookie de sesión sigue siendo la del admin y se rota
   * igual: por debajo su sesión nunca se interrumpe, y cuando el vale caduca
   * (o lo borra) vuelve a ser él sin tener que iniciar sesión otra vez.
   */
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rt = req.cookies?.[REFRESH_COOKIE]
    const tokens = await this.auth.refresh(rt)
    this.setRefreshCookie(res, tokens.refreshToken)

    const vale = req.cookies?.[IMPERSONATION_COOKIE]
    if (vale) {
      const suplantado = await this.auth.accessTokenParaSuplantacion(vale, tokens.userId)
      if (suplantado) return { accessToken: suplantado }
      // Vale caducado o ya sin valor: se limpia para no reintentarlo en cada
      // renovación y para que la app vea que la suplantación terminó.
      res.clearCookie(IMPERSONATION_COOKIE, { path: AUTH_COOKIE_PATH })
    }
    return { accessToken: tokens.accessToken }
  }

  /**
   * @endpoint POST /api/v1/auth/stop-impersonation
   * Borra el vale y devuelve al admin a su propia sesión.
   */
  @Post('stop-impersonation')
  async stopImpersonation(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.clearCookie(IMPERSONATION_COOKIE, { path: AUTH_COOKIE_PATH })
    const tokens = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE])
    this.setRefreshCookie(res, tokens.refreshToken)
    return { accessToken: tokens.accessToken }
  }

  /** @endpoint POST /api/v1/auth/logout */
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (req.cookies?.[REFRESH_COOKIE]) await this.auth.logout(req.cookies[REFRESH_COOKIE])
    res.clearCookie(REFRESH_COOKIE, { path: AUTH_COOKIE_PATH })
    res.clearCookie(IMPERSONATION_COOKIE, { path: AUTH_COOKIE_PATH })
    return { ok: true }
  }

  /**
   * @endpoint POST /api/v1/auth/forgot
   * Además del límite por IP, el servicio limita por CORREO (ver
   * auth.service): sin eso, rotando IPs se puede inundar el buzón de una
   * persona y quemar la cuota de envíos.
   */
  @Throttle({ auth: { ttl: 60_000, limit: 3 } })
  @Post('forgot')
  async forgot(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email)
    return { ok: true }
  }

  /** @endpoint POST /api/v1/auth/reset */
  // Evita que se prueben tokens de restablecimiento a lo bruto.
  @Throttle({ auth: { ttl: 60_000, limit: 10 } })
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
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: AUTH_COOKIE_PATH,
    })
  }
}
