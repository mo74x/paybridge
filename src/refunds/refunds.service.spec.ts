/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RefundsService } from './refunds.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrchestratorService } from '../providers/orchestrator/orchestrator.service';
import { OutboundWebhooksService } from '../outbound-webhooks/outbound-webhooks.service';
import { GatewayProvider } from '../../generated/prisma/enums';

describe('RefundsService', () => {
  let service: RefundsService;
  let mockPrisma: any;
  let mockOrchestrator: any;
  let mockOutboundWebhooks: any;

  beforeEach(async () => {
    mockPrisma = {
      paymentIntent: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      refund: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(mockPrisma)),
    };

    mockOrchestrator = {
      refund: jest.fn(),
    };

    mockOutboundWebhooks = {
      dispatchPaymentEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OrchestratorService, useValue: mockOrchestrator },
        { provide: OutboundWebhooksService, useValue: mockOutboundWebhooks },
      ],
    }).compile();

    service = module.get<RefundsService>(RefundsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw NotFoundException if payment intent does not exist', async () => {
    mockPrisma.paymentIntent.findUnique.mockResolvedValue(null);

    await expect(service.processRefund('non-existent-id', {})).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw BadRequestException if payment intent is not CAPTURED', async () => {
    mockPrisma.paymentIntent.findUnique.mockResolvedValue({
      id: 'intent-1',
      status: 'PENDING',
    });

    await expect(service.processRefund('intent-1', {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw BadRequestException if refund amount exceeds balance', async () => {
    mockPrisma.paymentIntent.findUnique.mockResolvedValue({
      id: 'intent-1',
      status: 'CAPTURED',
      amount: '100.00',
      gatewayPaymentId: 'pi_123',
      refunds: [{ status: 'SUCCEEDED', amount: '80.00' }],
    });

    await expect(
      service.processRefund('intent-1', { amount: 30 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should process a partial refund and leave intent as CAPTURED', async () => {
    const mockIntent = {
      id: 'intent-1',
      reference: 'ORD-1',
      amount: '100.00',
      currency: 'USD',
      status: 'CAPTURED',
      gateway: GatewayProvider.STRIPE,
      gatewayPaymentId: 'pi_stripe_123',
      customerEmail: 'user@example.com',
      refunds: [],
    };

    mockPrisma.paymentIntent.findUnique.mockResolvedValue(mockIntent);
    mockOrchestrator.refund.mockResolvedValue({
      gatewayRefundId: 're_123',
      status: 'SUCCEEDED',
      amount: 40,
      currency: 'USD',
    });
    mockPrisma.refund.create.mockResolvedValue({
      id: 'ref-db-1',
      paymentIntentId: 'intent-1',
      amount: 40,
      status: 'SUCCEEDED',
      gatewayRefundId: 're_123',
    });

    const result = await service.processRefund('intent-1', {
      amount: 40,
      reason: 'Customer requested',
    });

    expect(result.refundId).toBe('ref-db-1');
    expect(result.amount).toBe(40);
    expect(result.isFullyRefunded).toBe(false);
    expect(result.remainingBalance).toBe(60);
    expect(mockPrisma.paymentIntent.update).not.toHaveBeenCalled();
    expect(mockOutboundWebhooks.dispatchPaymentEvent).toHaveBeenCalledWith(
      'payment.refunded',
      expect.objectContaining({
        id: 'intent-1',
        status: 'CAPTURED',
      }),
    );
  });

  it('should process a full refund and update intent status to REFUNDED', async () => {
    const mockIntent = {
      id: 'intent-1',
      reference: 'ORD-1',
      amount: '100.00',
      currency: 'USD',
      status: 'CAPTURED',
      gateway: GatewayProvider.STRIPE,
      gatewayPaymentId: 'pi_stripe_123',
      customerEmail: 'user@example.com',
      refunds: [{ status: 'SUCCEEDED', amount: '40.00' }],
    };

    mockPrisma.paymentIntent.findUnique.mockResolvedValue(mockIntent);
    mockOrchestrator.refund.mockResolvedValue({
      gatewayRefundId: 're_456',
      status: 'SUCCEEDED',
      amount: 60,
      currency: 'USD',
    });
    mockPrisma.refund.create.mockResolvedValue({
      id: 'ref-db-2',
      paymentIntentId: 'intent-1',
      amount: 60,
      status: 'SUCCEEDED',
      gatewayRefundId: 're_456',
    });

    const result = await service.processRefund('intent-1', { amount: 60 });

    expect(result.isFullyRefunded).toBe(true);
    expect(result.remainingBalance).toBe(0);
    expect(mockPrisma.paymentIntent.update).toHaveBeenCalledWith({
      where: { id: 'intent-1' },
      data: { status: 'REFUNDED' },
    });
    expect(mockOutboundWebhooks.dispatchPaymentEvent).toHaveBeenCalledWith(
      'payment.refunded',
      expect.objectContaining({
        id: 'intent-1',
        status: 'REFUNDED',
      }),
    );
  });
});
