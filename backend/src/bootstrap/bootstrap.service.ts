import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import * as argon2 from 'argon2'
import { PrismaService } from '../prisma/prisma.service'
import { env } from '../config/env'

/**
 * Datos mínimos para que la plataforma sea operable en un entorno recién
 * desplegado (Railway): catálogo de planes y al menos un usuario admin.
 *
 * - Planes: sólo crea los que falten (no pisa precios editados por el admin).
 * - Admin: sólo si NO existe ningún usuario con rol admin. Credenciales desde
 *   ADMIN_EMAIL / ADMIN_PASSWORD (defaults = seed local, cámbialos en prod).
 *
 * Es idempotente y nunca lanza: un fallo aquí no debe tumbar el boot.
 */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly log = new Logger(BootstrapService.name)

  constructor(private prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
      await this.ensurePlans()
      await this.ensureAdmin()
    } catch (e) {
      this.log.error(`Bootstrap de datos falló (continuamos): ${(e as Error).message}`)
    }
  }

  private async ensurePlans() {
    const plans = [
      // 2-dias: mismo precio que 3-dias — es el mismo tiempo semanal (150 min)
      // repartido en 2 clases de 75 en vez de 3 de 50. Nace INACTIVO: no sale
      // en la página pública hasta que el admin lo active; sí puede asignarse
      // a estudiantes desde el panel estando inactivo.
      { id: '2-dias', name: '2 días / semana', daysPerWeek: 2, priceCop: 280000, priceUsd: 155, isActive: false },
      { id: '3-dias', name: '3 días / semana', daysPerWeek: 3, priceCop: 280000 },
      { id: '4-dias', name: '4 días / semana', daysPerWeek: 4, priceCop: 360000 },
      { id: '5-dias', name: '5 días / semana', daysPerWeek: 5, priceCop: 420000 },
    ]
    for (const p of plans) {
      const exists = await this.prisma.plan.findUnique({ where: { id: p.id } })
      if (!exists) {
        await this.prisma.plan.create({ data: { ...p, features: [] } })
        this.log.log(`Plan creado: ${p.id}`)
      }
    }
  }

  private async ensureAdmin() {
    const admins = await this.prisma.user.count({ where: { role: 'admin', deletedAt: null } })
    if (admins > 0) return
    const email = env.ADMIN_EMAIL.toLowerCase()
    const passwordHash = await argon2.hash(env.ADMIN_PASSWORD)
    await this.prisma.user.upsert({
      where: { email },
      update: { role: 'admin', passwordHash, disabledAt: null, deletedAt: null },
      create: {
        email,
        passwordHash,
        fullName: 'Admin',
        role: 'admin',
        emailVerifiedAt: new Date(),
      },
    })
    this.log.warn(
      `No existía ningún admin: se creó ${email}. Cambia la contraseña o define ADMIN_EMAIL/ADMIN_PASSWORD.`,
    )
  }
}
