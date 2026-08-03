import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AppRole } from '@prisma/client'
import { ROLES_KEY } from '../decorators/roles.decorator'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required || required.length === 0) return true
    const { user } = context.switchToHttp().getRequest()
    if (!user) throw new ForbiddenException('No user in request')
    // Multi-rol: basta con tener UNO de los roles requeridos, sea el principal
    // o uno extra (p. ej. un admin que además da clases entra a /teacher/*).
    const roles: AppRole[] = user.roles ?? [user.role]
    if (!required.some((r) => roles.includes(r))) {
      throw new ForbiddenException(`Requires role: ${required.join(' | ')}`)
    }
    return true
  }
}
