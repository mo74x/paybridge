/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { IPaymentProvider } from '../interfaces/payment-provider.interface';
import { StripeService } from '../stripe.service';
import { PaymobService } from '../paymob.service';
import { FawryService } from '../fawry.service';
import { GatewayProvider } from 'generated/prisma/enums';

@Injectable()
export class OrchestratorService {
  private readonly providers = new Map();

  constructor(
    private readonly stripeService: StripeService,
    private readonly paymobService: PaymobService,
    private readonly fawryService: FawryService,
  ) {
    // Register the active strategies
    this.providers.set(GatewayProvider.STRIPE, this.stripeService);
    this.providers.set(GatewayProvider.PAYMOB, this.paymobService);
    this.providers.set(GatewayProvider.FAWRY, this.fawryService);
  }

  // Returns the correct payment strategy based on the requested gateway.
  getProvider(gateway: GatewayProvider): IPaymentProvider {
    const provider = this.providers.get(gateway);
    if (!provider) {
      throw new InternalServerErrorException(
        `Gateway ${gateway} is not currently supported`,
      );
    }
    return provider;
  }
}
