import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProvidersModule } from './providers/providers.module';
import { ResilienceModule } from './common/resilience/resilience.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, ProvidersModule, ResilienceModule, WebhooksModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
