import { Module } from '@nestjs/common';
import { HealthService } from './health.service';
import { MetricsService } from './metrics.service';
import { HealthController } from './health.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ResilienceModule } from '../common/resilience/resilience.module';

@Module({
  imports: [PrismaModule, ResilienceModule],
  providers: [HealthService, MetricsService],
  controllers: [HealthController],
  exports: [HealthService, MetricsService],
})
export class HealthModule {}
