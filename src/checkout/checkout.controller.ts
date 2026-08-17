import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
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
  async createSession(@Body() createCheckoutDto: CreateCheckoutSessionDto) {
    return this.checkoutService.createSession(createCheckoutDto);
  }
}
