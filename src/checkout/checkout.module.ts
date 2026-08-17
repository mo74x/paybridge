import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { ProvidersModule } from '../providers/providers.module';
import { RoutingModule } from '../routing/routing.module';

@Module({
  providers: [CheckoutService],
  controllers: [CheckoutController],
  imports: [ProvidersModule, RoutingModule],
})
export class CheckoutModule {}
