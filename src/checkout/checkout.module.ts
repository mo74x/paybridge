import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  providers: [CheckoutService],
  controllers: [CheckoutController],
  imports: [ProvidersModule],
})
export class CheckoutModule {}
