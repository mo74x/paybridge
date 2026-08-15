import { Module } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker/circuit-breaker.service';

@Module({
  providers: [CircuitBreakerService],
  exports: [CircuitBreakerService],
})
export class ResilienceModule {}
