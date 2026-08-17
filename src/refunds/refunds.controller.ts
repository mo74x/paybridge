import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { RefundsService } from './refunds.service';
import { CreateRefundDto } from './dto/create-refund.dto';
import { ApiKeyGuard } from '../common/auth/api-key.guard';
import { IdempotencyInterceptor } from '../common/idempotency/idempotency.interceptor';

@Controller('api/v1/payments')
@UseGuards(ApiKeyGuard)
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async createRefund(
    @Param('id') id: string,
    @Body() createRefundDto: CreateRefundDto,
  ) {
    return this.refundsService.processRefund(id, createRefundDto);
  }

  @Get(':id/refunds')
  async getRefunds(@Param('id') id: string) {
    return this.refundsService.getRefundsByIntentId(id);
  }
}
