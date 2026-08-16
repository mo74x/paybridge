import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout.dto';

@Controller('api/v1/checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('session')
  @HttpCode(HttpStatus.CREATED)
  async createSession(@Body() createCheckoutDto: CreateCheckoutSessionDto) {
    return this.checkoutService.createSession(createCheckoutDto);
  }
}
