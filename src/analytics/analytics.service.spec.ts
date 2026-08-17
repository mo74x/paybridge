/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { GatewayProvider, PaymentStatus } from 'generated/prisma/enums';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      paymentIntent: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it('should compute correct summary, gateway rates, and refund metrics', async () => {
    const mockIntents = [
      {
        id: '1',
        amount: 100,
        currency: 'USD',
        gateway: GatewayProvider.STRIPE,
        status: PaymentStatus.CAPTURED,
        refunds: [{ amount: 20, status: 'SUCCEEDED' }],
      },
      {
        id: '2',
        amount: 50,
        currency: 'USD',
        gateway: GatewayProvider.STRIPE,
        status: PaymentStatus.FAILED,
        refunds: [],
      },
      {
        id: '3',
        amount: 500,
        currency: 'EGP',
        gateway: GatewayProvider.PAYMOB,
        status: PaymentStatus.CAPTURED,
        refunds: [],
      },
      {
        id: '4',
        amount: 200,
        currency: 'EGP',
        gateway: GatewayProvider.FAWRY,
        status: PaymentStatus.PENDING,
        refunds: [],
      },
    ];

    mockPrisma.paymentIntent.findMany.mockResolvedValue(mockIntents as any);
    const result = await service.getOverview();

    expect(result.summary.totalTransactions).toBe(4);
    expect(result.summary.successfulTransactions).toBe(2);
    expect(result.summary.failedTransactions).toBe(1);
    expect(result.summary.pendingTransactions).toBe(1);
    expect(result.summary.overallSuccessRate).toBe(66.67); // 2 / (2 + 1)
    expect(result.summary.overallConversionRate).toBe(50); // 2 / 4

    // Stripe breakdown
    expect(result.gatewayBreakdown.STRIPE.totalTransactions).toBe(2);
    expect(result.gatewayBreakdown.STRIPE.successfulTransactions).toBe(1);
    expect(result.gatewayBreakdown.STRIPE.failedTransactions).toBe(1);
    expect(result.gatewayBreakdown.STRIPE.successRate).toBe(50);
    expect(result.gatewayBreakdown.STRIPE.totalVolume['USD']).toBe(100);

    // Paymob breakdown
    expect(result.gatewayBreakdown.PAYMOB.totalTransactions).toBe(1);
    expect(result.gatewayBreakdown.PAYMOB.successfulTransactions).toBe(1);
    expect(result.gatewayBreakdown.PAYMOB.successRate).toBe(100);
    expect(result.gatewayBreakdown.PAYMOB.totalVolume['EGP']).toBe(500);

    // Refunds
    expect(result.refunds.totalRefunds).toBe(1);
    expect(result.refunds.totalRefundAmount['USD']).toBe(20);
  });
});
