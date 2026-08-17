/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { CheckoutService } from './checkout.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrchestratorService } from '../providers/orchestrator/orchestrator.service';
import { SmartRoutingService } from '../routing/smart-routing.service';
import { GatewayProvider } from 'generated/prisma/enums';
import { RoutingStrategy } from '../routing/routing.types';

describe('CheckoutService', () => {
  let service: CheckoutService;
  let prismaService: jest.Mocked<PrismaService>;
  let orchestratorService: jest.Mocked<OrchestratorService>;
  let smartRoutingService: jest.Mocked<SmartRoutingService>;

  beforeEach(async () => {
    const mockPrismaService = {
      paymentIntent: {
        create: jest.fn().mockResolvedValue({
          id: 'pi_test_123',
          reference: 'ORD-12345',
          amount: 500,
          currency: 'EGP',
          gateway: GatewayProvider.PAYMOB,
          status: 'PENDING',
        }),
      },
    };

    const mockOrchestratorService = {
      safeCreateIntentWithFallback: jest.fn().mockResolvedValue({
        result: {
          gatewayPaymentId: 'gw_pay_123',
          clientSecret: 'secret_xyz',
          rawResponse: {},
        },
        gateway: GatewayProvider.PAYMOB,
        attempts: [],
      }),
    };

    const mockSmartRoutingService = {
      resolveRoute: jest.fn().mockReturnValue({
        candidates: [
          GatewayProvider.PAYMOB,
          GatewayProvider.FAWRY,
          GatewayProvider.STRIPE,
        ],
        primary: GatewayProvider.PAYMOB,
        strategyUsed: RoutingStrategy.CURRENCY_OPTIMIZED,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: OrchestratorService, useValue: mockOrchestratorService },
        { provide: SmartRoutingService, useValue: mockSmartRoutingService },
      ],
    }).compile();

    service = module.get<CheckoutService>(CheckoutService);
    prismaService = module.get(PrismaService);
    orchestratorService = module.get(OrchestratorService);
    smartRoutingService = module.get(SmartRoutingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should resolve route, safely execute with fallback, persist intent, and return session data', async () => {
    const dto = {
      amount: 500,
      currency: 'EGP',
      customerEmail: 'customer@example.com',
    };

    const result = await service.createSession(dto);

    expect(smartRoutingService.resolveRoute).toHaveBeenCalledWith({
      amount: 500,
      currency: 'EGP',
      preferredGateway: undefined,
      strategy: undefined,
    });

    expect(
      orchestratorService.safeCreateIntentWithFallback,
    ).toHaveBeenCalledWith(
      [GatewayProvider.PAYMOB, GatewayProvider.FAWRY, GatewayProvider.STRIPE],
      500,
      'EGP',
      expect.stringMatching(/^ORD-/),
    );

    expect(prismaService.paymentIntent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 500,
        currency: 'EGP',
        gateway: GatewayProvider.PAYMOB,
        customerEmail: 'customer@example.com',
        gatewayPaymentId: 'gw_pay_123',
        status: 'PENDING',
      }),
    });

    expect(result).toEqual({
      intentId: 'pi_test_123',
      reference: 'ORD-12345',
      gateway: GatewayProvider.PAYMOB,
      clientSecret: 'secret_xyz',
    });
  });

  it('should record actual fallback gateway in DB if primary gateway failed over', async () => {
    orchestratorService.safeCreateIntentWithFallback.mockResolvedValue({
      result: {
        gatewayPaymentId: 'gw_fawry_456',
        clientSecret: 'secret_fawry',
        rawResponse: {},
      },
      gateway: GatewayProvider.FAWRY,
      attempts: [
        { gateway: GatewayProvider.PAYMOB, error: 'Circuit Breaker Open' },
      ],
    });

    const dto = {
      amount: 500,
      currency: 'EGP',
      customerEmail: 'customer@example.com',
    };

    const result = await service.createSession(dto);

    expect(prismaService.paymentIntent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        gateway: GatewayProvider.FAWRY,
        gatewayPaymentId: 'gw_fawry_456',
      }),
    });

    expect(result.gateway).toBe(GatewayProvider.FAWRY);
  });
});
