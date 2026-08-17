import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { ApiKeyGuard } from '../common/auth/api-key.guard';
import { ReconciliationSummary } from './interfaces/reconciliation.interface';

@Controller('api/v1/reconciliation')
@UseGuards(ApiKeyGuard)
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  async triggerReconciliation(): Promise<ReconciliationSummary> {
    return this.reconciliationService.reconcileStaleIntents();
  }
}
