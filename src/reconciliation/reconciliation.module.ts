import { Module } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationProcessor } from './reconciliation.processor';
import { ReconciliationController } from './reconciliation.controller';
import { ProvidersModule } from '../providers/providers.module';
import { OutboundWebhooksModule } from '../outbound-webhooks/outbound-webhooks.module';
import { AuthModule } from '../common/auth/auth.module';

@Module({
  imports: [ProvidersModule, OutboundWebhooksModule, AuthModule],
  controllers: [ReconciliationController],
  providers: [ReconciliationService, ReconciliationProcessor],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
