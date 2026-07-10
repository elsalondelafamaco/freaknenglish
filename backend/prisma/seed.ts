/**
 * Prisma seed — replicates storefront/src/lib/domain/seed.ts so anyone can
 * sign in with the same demo credentials documented in docs/migration.md.
 *
 * Run with:  bun run prisma:seed   (or)  npx tsx prisma/seed.ts
 */
import { PrismaClient, AppRole, EnglishLevel, SubscriptionStatus } from '@prisma/client'
import * as argon2 from 'argon2'

const prisma = new PrismaClient()

async function main() {
  // Plans (must match storefront/src/lib/domain/plans.ts)
  const plans = [
    { id: '3-dias', name: '3 días / semana', daysPerWeek: 3, priceCop: 280000 },
    { id: '4-dias', name: '4 días / semana', daysPerWeek: 4, priceCop: 360000 },
    { id: '5-dias', name: '5 días / semana', daysPerWeek: 5, priceCop: 420000 },
  ]
  for (const p of plans) {
    await prisma.plan.upsert({
      where: { id: p.id },
      update: p,
      create: { ...p, features: [] },
    })
  }

  const pw = await argon2.hash('Freakn123!')
  const users = [
    { email: 'estudiante@freakn.dev', fullName: 'Estudiante Demo', role: AppRole.student, englishLevel: EnglishLevel.beginner },
    { email: 'profe@freakn.dev', fullName: 'Profe Demo', role: AppRole.teacher, englishLevel: null },
    { email: 'admin@freakn.dev', fullName: 'Admin Demo', role: AppRole.admin, englishLevel: null },
  ]
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        passwordHash: pw,
        fullName: u.fullName,
        role: u.role,
        englishLevel: u.englishLevel,
        emailVerifiedAt: new Date(),
      },
    })
  }

  // El estudiante demo NO trae suscripción ni horario: así el flujo
  // onboarding → pago → horario queda visible al iniciar sesión.
  // Se limpia cualquier estado previo por si el seed ya se corrió antes.
  const student = await prisma.user.findUniqueOrThrow({ where: { email: 'estudiante@freakn.dev' } })
  await prisma.subscription.deleteMany({ where: { userId: student.id } })
  await prisma.user.update({
    where: { id: student.id },
    data: {
      phone: null,
      documentNumber: null,
      onboardedAt: null,
      schedulePreferences: undefined,
      scheduleAssignmentStatus: null,
    },
  })
  void SubscriptionStatus // referencia intencional para no romper import si se reactiva

  console.log('✔ Seed completo. Credenciales en docs/migration.md')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
