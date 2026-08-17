import { Test, TestingModule } from '@nestjs/testing';
import { SmartRoutingService } from './smart-routing.service';
import { CircuitBreakerService } from '../common/resilience/circuit-breaker/circuit-breaker.service';
import { GatewayProvider } from 'generated/prisma/enums';
import { RoutingStrategy } from './routing.types';

describe('SmartRoutingService', () => {
  let service: SmartRoutingService;
  let circuitBreakerService: jest.Mocked<CircuitBreakerService>;

  beforeEach(async () => {
    const mockCircuitBreaker = {
      isAvailable: jest.fn().mockReturnValue(true),
      getBreakerStatus: jest.fn().mockReturnValue('CLOSED'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmartRoutingService,
        {
          provide: CircuitBreakerService,
          useValue: mockCircuitBreaker,
        },
      ],
    }).compile();

    service = module.get<SmartRoutingService>(SmartRoutingService);
    circuitBreakerService = module.get(CircuitBreakerService);
  });

  describe('Currency-based Routing', () => {
    it('should route EGP to PAYMOB as primary with FAWRY and STRIPE as fallbacks', () => {
      const result = service.resolveRoute({
        amount: 500,
        currency: 'EGP',
      });

      expect(result.primary).toBe(GatewayProvider.PAYMOB);
      expect(result.candidates).toEqual([
        GatewayProvider.PAYMOB,
        GatewayProvider.FAWRY,
        GatewayProvider.STRIPE,
      ]);
      expect(result.strategyUsed).toBe(RoutingStrategy.CURRENCY_OPTIMIZED);
    });

    it('should route USD to STRIPE as primary with PAYMOB as fallback', () => {
      const result = service.resolveRoute({
        amount: 100,
        currency: 'USD',
      });

      expect(result.primary).toBe(GatewayProvider.STRIPE);
      expect(result.candidates).toEqual([
        GatewayProvider.STRIPE,
        GatewayProvider.PAYMOB,
      ]);
    });

    it('should route EUR to STRIPE as primary', () => {
      const result = service.resolveRoute({
        amount: 150,
        currency: 'EUR',
      });

      expect(result.primary).toBe(GatewayProvider.STRIPE);
    });

    it('should route SAR and AED to regional providers first', () => {
      const result = service.resolveRoute({
        amount: 200,
        currency: 'SAR',
      });

      expect(result.primary).toBe(GatewayProvider.PAYMOB);
      expect(result.candidates).toContain(GatewayProvider.STRIPE);
    });
  });

  describe('Preferred Gateway Override', () => {
    it('should prioritize merchant preferred gateway while maintaining fallback chain', () => {
      const result = service.resolveRoute({
        amount: 100,
        currency: 'USD',
        preferredGateway: GatewayProvider.FAWRY,
      });

      expect(result.primary).toBe(GatewayProvider.FAWRY);
      expect(result.candidates[0]).toBe(GatewayProvider.FAWRY);
      expect(result.candidates).toContain(GatewayProvider.STRIPE);
    });
  });

  describe('Fee Optimization Strategy', () => {
    it('should route micro-transactions in EGP to FAWRY for lowest fixed fee', () => {
      const result = service.resolveRoute({
        amount: 50,
        currency: 'EGP',
        strategy: RoutingStrategy.FEE_OPTIMIZED,
      });

      expect(result.primary).toBe(GatewayProvider.FAWRY);
    });

    it('should route standard transactions in EGP to PAYMOB under fee strategy', () => {
      const result = service.resolveRoute({
        amount: 500,
        currency: 'EGP',
        strategy: RoutingStrategy.FEE_OPTIMIZED,
      });

      expect(result.primary).toBe(GatewayProvider.PAYMOB);
    });
  });

  describe('Latency Optimization Strategy', () => {
    it('should route MENA transactions to PAYMOB for lowest local latency', () => {
      const result = service.resolveRoute({
        amount: 100,
        currency: 'EGP',
        strategy: RoutingStrategy.LOWEST_LATENCY,
      });

      expect(result.primary).toBe(GatewayProvider.PAYMOB);
    });

    it('should route Global transactions to STRIPE for lowest latency', () => {
      const result = service.resolveRoute({
        amount: 100,
        currency: 'USD',
        strategy: RoutingStrategy.LOWEST_LATENCY,
      });

      expect(result.primary).toBe(GatewayProvider.STRIPE);
    });
  });

  describe('Circuit Breaker Health Prioritization', () => {
    it('should automatically deprioritize tripped gateways and promote healthy fallback to primary', () => {
      // Simulate PAYMOB circuit breaker being OPEN
      circuitBreakerService.isAvailable.mockImplementation((gw) => {
        return gw !== GatewayProvider.PAYMOB;
      });

      const result = service.resolveRoute({
        amount: 500,
        currency: 'EGP',
      });

      // Since PAYMOB is down, FAWRY should be promoted to primary
      expect(result.primary).toBe(GatewayProvider.FAWRY);
      expect(result.candidates).toEqual([
        GatewayProvider.FAWRY,
        GatewayProvider.STRIPE,
        GatewayProvider.PAYMOB,
      ]);
    });
  });
});
