/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { ReconciliationService } from './reconciliation.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrchestratorService } from '../providers/orchestrator/orchestrator.service';
import { OutboundWebhooksService } from '../outbound-webhooks/outbound-webhooks.service';
import { GatewayProvider } from '../../generated/prisma/enums';

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let mockPrisma: any;
  let mockOrchestrator: any;
  let mockOutboundWebhooks: any;

  beforeEach(async () => {
    mockPrisma = {
      paymentIntent: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    mockOrchestrator = {
      fetchPaymentStatus: jest.fn(),
    };

    mockOutboundWebhooks = {
      dispatchPaymentEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OrchestratorService, useValue: mockOrchestrator },
        { provide: OutboundWebhooksService, useValue: mockOutboundWebhooks },
      ],
    }).compile();

    service = module.get<ReconciliationService>(ReconciliationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return empty summary if no stale pending intents found', async () => {
    mockPrisma.paymentIntent.findMany.mockResolvedValue([]);

    const summary = await service.reconcileStaleIntents();

    expect(summary.scanned).toBe(0);
    expect(summary.captured).toBe(0);
    expect(mockOrchestrator.fetchPaymentStatus).not.toHaveBeenCalled();
  });

  it('should reconcile stale pending intent to CAPTURED and dispatch webhook', async () => {
    const staleIntent = {
      id: 'uuid-intent-1',
      reference: 'ORD-1',
      amount: '100.00',
      currency: 'USD',
      status: 'PENDING',
      gateway: GatewayProvider.STRIPE,
      gatewayPaymentId: 'pi_stripe_123',
      customerEmail: 'user@example.com',
      createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 min old
    };

    mockPrisma.paymentIntent.findMany.mockResolvedValue([staleIntent]);
    mockOrchestrator.fetchPaymentStatus.mockResolvedValue('CAPTURED');
    mockPrisma.paymentIntent.update.mockResolvedValue({
      ...staleIntent,
      status: 'CAPTURED',
    });

    const summary = await service.reconcileStaleIntents();

    expect(summary.scanned).toBe(1);
    expect(summary.captured).toBe(1);
    expect(summary.failed).toBe(0);
    expect(mockOrchestrator.fetchPaymentStatus).toHaveBeenCalledWith(
      GatewayProvider.STRIPE,
      'pi_stripe_123',
    );
    expect(mockPrisma.paymentIntent.update).toHaveBeenCalledWith({
      where: { id: 'uuid-intent-1' },
      data: { status: 'CAPTURED' },
    });
    expect(mockOutboundWebhooks.dispatchPaymentEvent).toHaveBeenCalledWith(
      'payment.succeeded',
      expect.objectContaining({
        id: 'uuid-intent-1',
        status: 'CAPTURED',
      }),
    );
  });

  it('should reconcile stale pending intent to FAILED and dispatch webhook', async () => {
    const staleIntent = {
      id: 'uuid-intent-2',
      reference: 'ORD-2',
      amount: '50.00',
      currency: 'USD',
      status: 'PENDING',
      gateway: GatewayProvider.PAYMOB,
      gatewayPaymentId: 'ord_paymob_fail_99',
      customerEmail: 'user@example.com',
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
    };

    mockPrisma.paymentIntent.findMany.mockResolvedValue([staleIntent]);
    mockOrchestrator.fetchPaymentStatus.mockResolvedValue('FAILED');
    mockPrisma.paymentIntent.update.mockResolvedValue({
      ...staleIntent,
      status: 'FAILED',
    });

    const summary = await service.reconcileStaleIntents();

    expect(summary.scanned).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.captured).toBe(0);
    expect(mockOutboundWebhooks.dispatchPaymentEvent).toHaveBeenCalledWith(
      'payment.failed',
      expect.objectContaining({
        id: 'uuid-intent-2',
        status: 'FAILED',
      }),
    );
  });
});
