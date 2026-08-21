import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
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
    @Req() req: Request,
  ) {
    return this.refundsService.processRefund(
      id,
      createRefundDto,
      req.merchant!.id,
    );
  }

  @Get(':id/refunds')
  async getRefunds(@Param('id') id: string, @Req() req: Request) {
    return this.refundsService.getRefundsByIntentId(id, req.merchant!.id);
  }
}
