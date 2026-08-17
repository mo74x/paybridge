import { Module } from '@nestjs/common';
import { SmartRoutingService } from './smart-routing.service';
import { ResilienceModule } from '../common/resilience/resilience.module';

@Module({
  imports: [ResilienceModule],
  providers: [SmartRoutingService],
  exports: [SmartRoutingService],
})
export class RoutingModule {}
