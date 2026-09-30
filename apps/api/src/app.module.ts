import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { BillingModule } from './billing/billing.module';
import { CatalogModule } from './catalog/catalog.module';
import { ClinicalModule } from './clinical/clinical.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),

    PrismaModule,
    RedisModule,
    AuthModule,
    CatalogModule,
    AppointmentsModule,
    ClinicalModule,
    BillingModule,
  ],

  controllers: [HealthController],
})
export class AppModule {}
