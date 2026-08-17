/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { GatewayProvider } from 'generated/prisma/enums';
import CircuitBreaker from 'opossum';
import { PaymentIntentResult } from 'src/providers/interfaces/payment-provider.interface';

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly breakers = new Map<
    GatewayProvider,
    CircuitBreaker<any[], PaymentIntentResult>
  >();

  // Circuit Breaker Configuration
  private readonly breakerOptions = {
    timeout: 5000, // 5 seconds: If the gateway takes longer, mark it as a failure
    errorThresholdPercentage: 50, // Trip the breaker if 50% of requests fail...
    volumeThreshold: 10, // ...but only after at least 10 requests have been made
    resetTimeout: 30000, // Wait 30 seconds before trying a test request (Half-Open state)
  };

  getBreaker(
    gateway: GatewayProvider,
    action: (...args: any[]) => Promise<PaymentIntentResult>,
  ): CircuitBreaker<any[], PaymentIntentResult> {
    let breaker = this.breakers.get(gateway);

    if (!breaker) {
      breaker = new CircuitBreaker(action, this.breakerOptions);

      // Listeners for observability
      breaker.on('open', () =>
        this.logger.error(
          `🚨 CIRCUIT TRIPPED: ${gateway} is down. Failing fast.`,
        ),
      );
      breaker.on('halfOpen', () =>
        this.logger.warn(`⚠️ CIRCUIT HALF-OPEN: Testing ${gateway} recovery.`),
      );
      breaker.on('close', () =>
        this.logger.log(`✅ CIRCUIT RECOVERED: ${gateway} is back online.`),
      );

      this.breakers.set(gateway, breaker);
    }

    return breaker;
  }

  async fire(
    gateway: GatewayProvider,
    action: (...args: any[]) => Promise<PaymentIntentResult>,
    ...args: any[]
  ): Promise<PaymentIntentResult> {
    const breaker = this.getBreaker(gateway, action);

    try {
      const result = await breaker.fire(...args);
      return result;
    } catch (error: any) {
      if (error?.type === 'open' || error?.code === 'EOPENBREAKER') {
        throw new InternalServerErrorException(
          `Payment Gateway (${gateway}) is currently unavailable. Please try another payment method.`,
        );
      }
      throw error;
    }
  }

  /**
   * Checks whether the circuit breaker for a given gateway is currently closed or half-open (available).
   */
  isAvailable(gateway: GatewayProvider): boolean {
    const breaker = this.breakers.get(gateway);
    if (!breaker) {
      return true;
    }
    return !breaker.opened;
  }

  /**
   * Returns the current status of the circuit breaker for the given gateway.
   */
  getBreakerStatus(gateway: GatewayProvider): 'OPEN' | 'HALF_OPEN' | 'CLOSED' {
    const breaker = this.breakers.get(gateway);
    if (!breaker) {
      return 'CLOSED';
    }
    if (breaker.opened) {
      return 'OPEN';
    }
    if (breaker.halfOpen) {
      return 'HALF_OPEN';
    }
    return 'CLOSED';
  }

  /**
   * Returns a status map of all supported gateways.
   */
  getAllBreakersStatus(): Record<
    GatewayProvider,
    'OPEN' | 'HALF_OPEN' | 'CLOSED'
  > {
    return {
      [GatewayProvider.STRIPE]: this.getBreakerStatus(GatewayProvider.STRIPE),
      [GatewayProvider.PAYMOB]: this.getBreakerStatus(GatewayProvider.PAYMOB),
      [GatewayProvider.FAWRY]: this.getBreakerStatus(GatewayProvider.FAWRY),
    };
  }
}
