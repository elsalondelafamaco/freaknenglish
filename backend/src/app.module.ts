import { Module } from '@nestjs/common'
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
    // Límites por IP en tres escalones. El `default` aplica a toda la API;
    // los otros dos se piden explícitamente con @Throttle en los endpoints
    // sensibles (login, registro, recuperación de clave, checkout).
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 100 },
      // Anti-ráfaga: frena scripts que martillan un endpoint.
      { name: 'burst', ttl: 10_000, limit: 20 },
      // Autenticación y correo: pocos intentos por minuto. Protege contra
      // fuerza bruta de contraseñas y contra quemar la cuota de Resend.
      { name: 'auth', ttl: 60_000, limit: 5 },
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
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }, BootstrapService],
})
export class AppModule {}
