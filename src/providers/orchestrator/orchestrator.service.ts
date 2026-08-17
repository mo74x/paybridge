import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  GatewayPaymentStatus,
  IPaymentProvider,
  PaymentIntentResult,
} from '../interfaces/payment-provider.interface';
import { StripeService } from '../stripe.service';
import { PaymobService } from '../paymob.service';
import { FawryService } from '../fawry.service';
import { GatewayProvider } from 'generated/prisma/enums';
import { CircuitBreakerService } from '../../common/resilience/circuit-breaker/circuit-breaker.service';

@Injectable()
export class OrchestratorService {
  private readonly providers = new Map<GatewayProvider, IPaymentProvider>();

  constructor(
    private readonly stripeService: StripeService,
    private readonly paymobService: PaymobService,
    private readonly fawryService: FawryService,
    private readonly circuitBreaker: CircuitBreakerService,
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

  /**
   * Safely executes a payment intent creation wrapped in a Circuit Breaker.
   */
  async safeCreateIntent(
    gateway: GatewayProvider,
    amount: number,
    currency: string,
    reference: string,
  ): Promise<PaymentIntentResult> {
    const provider = this.getProvider(gateway);

    // We bind the context of the provider to ensure 'this' behaves correctly inside the wrapped function
    const action = provider.createIntent.bind(provider);

    // Fire the action through the circuit breaker specifically assigned to this gateway
    return this.circuitBreaker.fire(
      gateway,
      action,
      amount,
      currency,
      reference,
    );
  }

  /**
   * Queries the external payment gateway to determine the true current status of a payment.
   */
  async fetchPaymentStatus(
    gateway: GatewayProvider,
    gatewayPaymentId: string,
  ): Promise<GatewayPaymentStatus> {
    const provider = this.getProvider(gateway);
    return provider.fetchPaymentStatus(gatewayPaymentId);
  }
}
