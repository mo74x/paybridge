import { Module } from '@nestjs/common';
import { OrchestratorService } from './orchestrator/orchestrator.service';
import { StripeService } from './stripe.service';
import { PaymobService } from './paymob.service';
import { FawryService } from './fawry.service';

@Module({
  providers: [OrchestratorService, StripeService, PaymobService, FawryService],
  exports: [OrchestratorService],
})
export class ProvidersModule {}
