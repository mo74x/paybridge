/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import { ApiKeyGuard } from '../common/auth/api-key.guard';
import { IdempotencyInterceptor } from '../common/idempotency/idempotency.interceptor';
import { PrismaService } from '../prisma/prisma.service';

describe('RefundsController', () => {
  let controller: RefundsController;
  let service: RefundsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RefundsController],
      providers: [
        {
          provide: RefundsService,
          useValue: {
            processRefund: jest.fn(),
            getRefundsByIntentId: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            idempotencyKey: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
        ApiKeyGuard,
        IdempotencyInterceptor,
      ],
    }).compile();

    controller = module.get<RefundsController>(RefundsController);
    service = module.get<RefundsService>(RefundsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call refundsService.processRefund', async () => {
    const mockResult = {
      refundId: 'ref_1',
      paymentIntentId: 'intent_1',
      amount: 50,
      currency: 'USD',
      status: 'SUCCEEDED',
      gatewayRefundId: 're_stripe_1',
      remainingBalance: 50,
      isFullyRefunded: false,
    };

    jest.spyOn(service, 'processRefund').mockResolvedValue(mockResult);

    const result = await controller.createRefund('intent_1', { amount: 50 });
    expect(result).toEqual(mockResult);
    expect(service.processRefund).toHaveBeenCalledWith('intent_1', {
      amount: 50,
    });
  });

  it('should call refundsService.getRefundsByIntentId', async () => {
    const mockResult: any = {
      paymentIntentId: 'intent_1',
      reference: 'ORD-1',
      totalAmount: 100,
      currency: 'USD',
      status: 'CAPTURED',
      refunds: [],
    };

    jest.spyOn(service, 'getRefundsByIntentId').mockResolvedValue(mockResult);

    const result = await controller.getRefunds('intent_1');
    expect(result).toEqual(mockResult);
    expect(service.getRefundsByIntentId).toHaveBeenCalledWith('intent_1');
  });
});
