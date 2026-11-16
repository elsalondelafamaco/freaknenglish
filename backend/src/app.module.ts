import { ExecutionContext, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerModule } from '@nestjs/throttler'
import { LoggerModule } from 'nestjs-pino'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard } from '@nestjs/throttler'

import { PrismaModule } from './prisma/prisma.module'
import { BootstrapService } from './bootstrap/bootstrap.service'
import { AuthModule } from './modules/auth/auth.module'
import { UsersModule } from './modules/users/users.module'
import { PlansModule } from './modules/plans/plans.module'
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module'
import { CheckoutModule } from './modules/checkout/checkout.module'
import { WompiModule } from './modules/wompi/wompi.module'
import { ClassesModule } from './modules/classes/classes.module'
import { LearningModule } from './modules/learning/learning.module'
import { TeachersModule } from './modules/teachers/teachers.module'
import { AdminModule } from './modules/admin/admin.module'
import { NotificationsModule } from './modules/notifications/notifications.module'
import { SurveysModule } from './modules/surveys/surveys.module'
import { BoardModule } from './modules/board/board.module'
import { HealthModule } from './modules/health/health.module'
import { JobsModule } from './modules/jobs/jobs.module'
import { SchedulingModule } from './modules/scheduling/scheduling.module'
import { ExchangeModule } from './modules/exchange/exchange.module'
import { PromotionsModule } from './modules/promotions/promotions.module'

/**
 * ¿El endpoint (o su controlador) pidió este límite con @Throttle? @Throttle
 * deja su tope como metadato `THROTTLER:LIMIT<nombre>`.
 */
function pideLimite(ctx: ExecutionContext, nombre: string): boolean {
  const clave = `THROTTLER:LIMIT${nombre}`
  return Reflect.getMetadata(clave, ctx.getHandler()) != null || Reflect.getMetadata(clave, ctx.getClass()) != null
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    ScheduleModule.forRoot(),
    // Límites por IP en tres escalones. `default` y `burst` aplican a toda la
    // API; `auth` solo a los endpoints que lo piden con @Throttle (login,
    // registro, recuperación de clave).
    ThrottlerModule.forRoot([
      // Los límites anteriores (100/min, 20/10s, 5/min) se quedaban cortos en
      // uso normal: el admin y el profe disparan muchas llamadas por pantalla
      // (calendario + disponibilidad + listados), y quien se equivoca dos veces
      // de contraseña se quedaba fuera un minuto. Siguen siendo un techo para
      // scripts, pero ya no le pegan a una persona trabajando.
      { name: 'default', ttl: 60_000, limit: 600 },
      // Anti-ráfaga: frena scripts que martillan un endpoint.
      { name: 'burst', ttl: 10_000, limit: 120 },
      // Autenticación y correo: protege contra fuerza bruta de contraseñas y
      // contra quemar la cuota de Resend, sin castigar un par de reintentos.
      //
      // En @nestjs/throttler v6 TODOS los límites con nombre aplican a todas
      // las rutas: este, pensado solo para login, contaba cada llamada de la
      // API y cortaba con 429 a quien navegaba rápido (home → plan → horario)
      // o a una pantalla del admin con varias consultas. Ahora solo cuenta
      // donde el endpoint lo pide con @Throttle({ auth: … }).
      { name: 'auth', ttl: 60_000, limit: 20, skipIf: (ctx) => !pideLimite(ctx, 'auth') },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    PlansModule,
    SubscriptionsModule,
    CheckoutModule,
    WompiModule,
    ClassesModule,
    LearningModule,
    TeachersModule,
    AdminModule,
    NotificationsModule,
    SurveysModule,
    BoardModule,
    HealthModule,
    JobsModule,
    SchedulingModule,
    ExchangeModule,
    PromotionsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }, BootstrapService],
})
export class AppModule {}
