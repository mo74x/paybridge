/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, Logger } from '@nestjs/common';
import { GatewayProvider } from 'generated/prisma/enums';
import { CircuitBreakerService } from '../common/resilience/circuit-breaker/circuit-breaker.service';
import {
  RoutingContext,
  RoutingResult,
  RoutingStrategy,
} from './routing.types';

@Injectable()
export class SmartRoutingService {
  private readonly logger = new Logger(SmartRoutingService.name);

  constructor(private readonly circuitBreaker: CircuitBreakerService) {}

  /**
   * Evaluates the routing context and returns a prioritized list of gateway candidates
   * with automatic circuit-breaker-aware health prioritization.
   */
  resolveRoute(context: RoutingContext): RoutingResult {
    const currency = (context.currency || '').toUpperCase();
    const strategy = context.strategy || RoutingStrategy.CURRENCY_OPTIMIZED;

    let baseCandidates: GatewayProvider[];

    if (context.preferredGateway) {
      baseCandidates = this.buildPreferredChain(
        context.preferredGateway,
        currency,
      );
    } else {
      switch (strategy) {
        case RoutingStrategy.FEE_OPTIMIZED:
          baseCandidates = this.resolveFeeOptimized(context.amount, currency);
          break;
        case RoutingStrategy.LOWEST_LATENCY:
          baseCandidates = this.resolveLatencyOptimized(currency);
          break;
        case RoutingStrategy.CURRENCY_OPTIMIZED:
        default:
          baseCandidates = this.resolveCurrencyOptimized(currency);
          break;
      }
    }

    // Prioritize healthy gateways based on Circuit Breaker state
    const prioritizedCandidates = this.applyHealthPrioritization(
      baseCandidates,
      context.preferredGateway,
    );

    const primary = prioritizedCandidates[0] || GatewayProvider.STRIPE;

    this.logger.log(
      `🎯 Smart Route for ${context.amount} ${currency} (Strategy: ${strategy}): Selected Primary -> ${primary}, Fallback Chain -> [${prioritizedCandidates.join(' -> ')}]`,
    );

    return {
      candidates: prioritizedCandidates,
      primary,
      strategyUsed: strategy,
    };
  }

  /**
   * Currency-based routing defaults:
   * - EGP: Local Egyptian providers first (Paymob, Fawry)
   * - USD / EUR / GBP: Global card networks first (Stripe)
   * - SAR / AED: Regional providers (Paymob, Stripe)
   */
  private resolveCurrencyOptimized(currency: string): GatewayProvider[] {
    switch (currency) {
      case 'EGP':
        return [
          GatewayProvider.PAYMOB,
          GatewayProvider.FAWRY,
          GatewayProvider.STRIPE,
        ];
      case 'USD':
      case 'EUR':
      case 'GBP':
        return [GatewayProvider.STRIPE, GatewayProvider.PAYMOB];
      case 'SAR':
      case 'AED':
        return [
          GatewayProvider.PAYMOB,
          GatewayProvider.STRIPE,
          GatewayProvider.FAWRY,
        ];
      default:
        return [
          GatewayProvider.STRIPE,
          GatewayProvider.PAYMOB,
          GatewayProvider.FAWRY,
        ];
    }
  }

  /**
   * Fee-optimized routing:
   * - For EGP: Micro-transactions (< 100 EGP) prioritize Fawry (lower fixed fee), higher amounts prioritize Paymob
   * - For international: Stripe has lowest interchange fees
   */
  private resolveFeeOptimized(
    amount: number,
    currency: string,
  ): GatewayProvider[] {
    if (currency === 'EGP') {
      if (amount < 100) {
        return [
          GatewayProvider.FAWRY,
          GatewayProvider.PAYMOB,
          GatewayProvider.STRIPE,
        ];
      }
      return [
        GatewayProvider.PAYMOB,
        GatewayProvider.FAWRY,
        GatewayProvider.STRIPE,
      ];
    }
    return [GatewayProvider.STRIPE, GatewayProvider.PAYMOB];
  }

  /**
   * Latency-optimized routing:
   * - MENA regions route to regional edge endpoints (Paymob / Fawry)
   * - Western currencies route to Stripe
   */
  private resolveLatencyOptimized(currency: string): GatewayProvider[] {
    if (['EGP', 'SAR', 'AED', 'KWD'].includes(currency)) {
      return [
        GatewayProvider.PAYMOB,
        GatewayProvider.FAWRY,
        GatewayProvider.STRIPE,
      ];
    }
    return [GatewayProvider.STRIPE, GatewayProvider.PAYMOB];
  }

  /**
   * Constructs candidate chain respecting merchant preferred gateway first.
   */
  private buildPreferredChain(
    preferred: GatewayProvider,
    currency: string,
  ): GatewayProvider[] {
    const currencyDefaults = this.resolveCurrencyOptimized(currency);
    const fallbacks = currencyDefaults.filter((g) => g !== preferred);
    return [preferred, ...fallbacks];
  }

  /**
   * Reorders candidate list so that gateways with open circuit breakers are moved to the end.
   */
  private applyHealthPrioritization(
    candidates: GatewayProvider[],
    preferredGateway?: GatewayProvider,
  ): GatewayProvider[] {
    const healthy: GatewayProvider[] = [];
    const tripped: GatewayProvider[] = [];

    for (const gateway of candidates) {
      if (this.circuitBreaker.isAvailable(gateway)) {
        healthy.push(gateway);
      } else {
        tripped.push(gateway);
        this.logger.warn(
          `⚠️ Circuit for ${gateway} is OPEN. Deprioritizing in fallback chain.`,
        );
      }
    }

    // If all are tripped, preserve the original candidate order to attempt fail-fast/test requests
    if (healthy.length === 0) {
      return candidates;
    }

    return [...healthy, ...tripped];
  }
}
