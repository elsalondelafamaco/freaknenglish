import { ExecutionContext, createParamDecorator } from '@nestjs/common'

export type AuthUser = {
  id: string
  email: string
  /** Rol principal (define la home del usuario). */
  role: 'student' | 'teacher' | 'admin'
  /** Roles efectivos = principal + extras. Úsalo para decidir permisos. */
  roles: Array<'student' | 'teacher' | 'admin'>
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
)
