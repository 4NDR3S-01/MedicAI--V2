import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { HealthController } from './health.controller';
import { validateEnv } from '../config/env.validation';
import { MailModule } from '../infrastructure/mail/mail.module';
import { PrismaModule } from '../infrastructure/prisma/prisma.module';
import { UserThrottlerGuard } from '../infrastructure/throttling/user-throttler.guard';
import { AuthModule } from '../modules/auth/auth.module';
import { AiModule } from '../modules/ai/ai.module';
import { MedicationsModule } from '../modules/medications/medications.module';
import { AppointmentsModule } from '../modules/appointments/appointments.module';
import { CircleModule } from '../modules/circle/circle.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: 60_000,
          // Límite por usuario autenticado (o por IP si no hay token válido).
          // Ver UserThrottlerGuard.
          // Al abrir la app se sincronizan alarmas, Círculo y seguimiento
          // (~6 peticiones) y se repite al volver a ella: 30/min se quedaba
          // corto para un uso normal. Registro, login e IA tienen límites propios.
          limit: configService.get<number>('THROTTLE_LIMIT') ?? 120,
        },
      ],
    }),
    PrismaModule,
    MailModule,
    AuthModule,
    AiModule,
    MedicationsModule,
    AppointmentsModule,
    CircleModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: UserThrottlerGuard,
    },
  ],
  controllers: [HealthController],
})
export class AppModule {}
