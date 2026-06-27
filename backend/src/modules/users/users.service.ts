import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
  me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: { include: { plan: true } } },
    })
  }
  update(userId: string, data: { fullName?: string; phone?: string; avatarUrl?: string }) {
    return this.prisma.user.update({ where: { id: userId }, data })
  }
}
