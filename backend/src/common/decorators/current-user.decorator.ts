import { ExecutionContext, createParamDecorator } from '@nestjs/common'

export type AuthUser = { id: string; email: string; role: 'student' | 'teacher' | 'admin' }

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
)
