import { Test, TestingModule } from '@nestjs/testing';
import { OrchestratorService } from './orchestrator.service';
import { StripeService } from '../stripe.service';
import { PaymobService } from '../paymob.service';
import { FawryService } from '../fawry.service';
import { GatewayProvider } from 'generated/prisma/enums';

describe('OrchestratorService', () => {
  let service: OrchestratorService;
  let stripeService: StripeService;
  let paymobService: PaymobService;
  let fawryService: FawryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrchestratorService,
        {
          provide: StripeService,
          useValue: { createIntent: jest.fn() },
        },
        {
          provide: PaymobService,
          useValue: { createIntent: jest.fn() },
        },
        {
          provide: FawryService,
          useValue: { createIntent: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<OrchestratorService>(OrchestratorService);
    stripeService = module.get<StripeService>(StripeService);
    paymobService = module.get<PaymobService>(PaymobService);
    fawryService = module.get<FawryService>(FawryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return StripeService for STRIPE gateway', () => {
    expect(service.getProvider(GatewayProvider.STRIPE)).toBe(stripeService);
  });

  it('should return PaymobService for PAYMOB gateway', () => {
    expect(service.getProvider(GatewayProvider.PAYMOB)).toBe(paymobService);
  });

  it('should return FawryService for FAWRY gateway', () => {
    expect(service.getProvider(GatewayProvider.FAWRY)).toBe(fawryService);
  });
});
