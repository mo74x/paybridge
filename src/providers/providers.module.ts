import { Module } from '@nestjs/common';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import { StripeService } from './stripe.service';
import { PaymobService } from './paymob.service';

@Module({
  providers: [OrchestratorService, StripeService, PaymobService],
  exports: [OrchestratorService],
})
export class ProvidersModule {}
