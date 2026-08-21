import { Module } from '@nestjs/common';
import { OutboundWebhooksService } from './outbound-webhooks.service';
import { OutboundWebhooksProcessor } from './outbound-webhooks.processor';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [OutboundWebhooksService, OutboundWebhooksProcessor],
  exports: [OutboundWebhooksService],
})
export class OutboundWebhooksModule {}
