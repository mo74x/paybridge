import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProvidersModule } from './providers/providers.module';
import { ResilienceModule } from './common/resilience/resilience.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { PrismaModule } from './prisma/prisma.module';
import { CheckoutModule } from './checkout/checkout.module';
import { OutboundWebhooksModule } from './outbound-webhooks/outbound-webhooks.module';
import { AuthModule } from './common/auth/auth.module';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';

@Module({
  imports: [
    PrismaModule,
    ProvidersModule,
    ResilienceModule,
    WebhooksModule,
    CheckoutModule,
    OutboundWebhooksModule,
    AuthModule,
    IdempotencyModule,
    ReconciliationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
