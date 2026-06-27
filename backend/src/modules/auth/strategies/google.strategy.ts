import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy, Profile } from 'passport-google-oauth20'
import { env } from '../../../config/env'

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: env.GOOGLE_CLIENT_ID || 'placeholder',
      clientSecret: env.GOOGLE_CLIENT_SECRET || 'placeholder',
      callbackURL: env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/v1/auth/google/callback',
      scope: ['email', 'profile'],
    })
  }
  async validate(_accessToken: string, _refreshToken: string, profile: Profile) {
    return {
      email: profile.emails?.[0]?.value,
      fullName: profile.displayName,
      googleSub: profile.id,
      avatarUrl: profile.photos?.[0]?.value,
    }
  }
}
