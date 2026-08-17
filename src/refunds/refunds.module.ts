import { Module } from '@nestjs/common';
import { RefundsService } from './refunds.service';
import { RefundsController } from './refunds.controller';
import { ProvidersModule } from '../providers/providers.module';
import { OutboundWebhooksModule } from '../outbound-webhooks/outbound-webhooks.module';
import { AuthModule } from '../common/auth/auth.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';

@Module({
  imports: [
    ProvidersModule,
    OutboundWebhooksModule,
    AuthModule,
    IdempotencyModule,
  ],
  controllers: [RefundsController],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}
