/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeyGuard } from '../common/auth/api-key.guard';
import { IdempotencyInterceptor } from '../common/idempotency/idempotency.interceptor';
import { GatewayProvider } from '../../generated/prisma/enums';

describe('CheckoutController', () => {
  let controller: CheckoutController;
  let checkoutService: CheckoutService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CheckoutController],
      providers: [
        {
          provide: CheckoutService,
          useValue: {
            createSession: jest.fn(),
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

    controller = module.get<CheckoutController>(CheckoutController);
    checkoutService = module.get<CheckoutService>(CheckoutService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call checkoutService.createSession and return result', async () => {
    const dto = {
      amount: 100,
      currency: 'USD',
      customerEmail: 'user@example.com',
      gateway: GatewayProvider.STRIPE,
    };
    const expectedResult = {
      intentId: 'uuid-123',
      reference: 'ORD-123',
      gateway: GatewayProvider.STRIPE,
      clientSecret: 'secret_abc',
    };

    jest
      .spyOn(checkoutService, 'createSession')
      .mockResolvedValue(expectedResult);

    const result = await controller.createSession(dto);
    expect(result).toEqual(expectedResult);
    expect(checkoutService.createSession).toHaveBeenCalledWith(dto);
  });
});
