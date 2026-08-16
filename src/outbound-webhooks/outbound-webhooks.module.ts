import { Module } from '@nestjs/common';
import { OutboundWebhooksService } from './outbound-webhooks.service';
import { OutboundWebhooksProcessor } from './outbound-webhooks.processor';

@Module({
  providers: [OutboundWebhooksService, OutboundWebhooksProcessor],
  exports: [OutboundWebhooksService],
})
export class OutboundWebhooksModule {}
