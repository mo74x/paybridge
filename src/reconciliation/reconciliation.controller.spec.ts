/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import { ApiKeyGuard } from '../common/auth/api-key.guard';

describe('ReconciliationController', () => {
  let controller: ReconciliationController;
  let service: ReconciliationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReconciliationController],
      providers: [
        {
          provide: ReconciliationService,
          useValue: {
            reconcileStaleIntents: jest.fn(),
          },
        },
        ApiKeyGuard,
      ],
    }).compile();

    controller = module.get<ReconciliationController>(ReconciliationController);
    service = module.get<ReconciliationService>(ReconciliationService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should trigger reconciliation and return summary report', async () => {
    const mockSummary = {
      scanned: 5,
      captured: 3,
      failed: 1,
      unchanged: 1,
      errors: [],
      executedAt: new Date().toISOString(),
    };

    jest.spyOn(service, 'reconcileStaleIntents').mockResolvedValue(mockSummary);

    const result = await controller.triggerReconciliation();
    expect(result).toEqual(mockSummary);
    expect(service.reconcileStaleIntents).toHaveBeenCalledTimes(1);
  });
});
