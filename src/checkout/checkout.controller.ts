import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { CheckoutService } from './checkout.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout.dto';
import { ApiKeyGuard } from '../common/auth/api-key.guard';
import { IdempotencyInterceptor } from '../common/idempotency/idempotency.interceptor';

@Controller('api/v1/checkout')
@UseGuards(ApiKeyGuard)
@UseInterceptors(IdempotencyInterceptor)
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('session')
  @HttpCode(HttpStatus.CREATED)
  async createSession(
    @Body() createCheckoutDto: CreateCheckoutSessionDto,
    @Req() req: Request,
  ) {
    return this.checkoutService.createSession(
      createCheckoutDto,
      req.merchant!.id,
    );
  }
}
