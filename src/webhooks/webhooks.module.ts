import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { ProvidersModule } from '../providers/providers.module';
import { OutboundWebhooksModule } from '../outbound-webhooks/outbound-webhooks.module';

@Module({
  imports: [ProvidersModule, OutboundWebhooksModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
