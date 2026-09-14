import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';

import { HealthController } from './health.controller';
import { validateEnv } from '../config/env.validation';
import { MailModule } from '../infrastructure/mail/mail.module';
import { PrismaModule } from '../infrastructure/prisma/prisma.module';
import { AuthModule } from '../modules/auth/auth.module';
import { AiModule } from '../modules/ai/ai.module';
import { MedicationsModule } from '../modules/medications/medications.module';
import { AppointmentsModule } from '../modules/appointments/appointments.module';

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
          // 300 req/min es excesivo para un Celeron N2840 con 2 GB RAM.
          // 30 req/min por IP es razonable para una app móvil de salud.
          limit: configService.get<number>('THROTTLE_LIMIT') ?? 30,
        },
      ],
    }),
    CacheModule.register({
      ttl: 60_000,
      max: 100,
      isGlobal: true,
    }),
    PrismaModule,
    MailModule,
    AuthModule,
    AiModule,
    MedicationsModule,
    AppointmentsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  controllers: [HealthController],
})
export class AppModule {}
