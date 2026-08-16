import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrchestratorService } from '../providers/orchestrator/orchestrator.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout.dto';
import * as crypto from 'crypto';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: OrchestratorService,
  ) {}

  async createSession(dto: CreateCheckoutSessionDto) {
    // Generate a unique internal idempotency/reference key
    // In a real e-commerce app, this would be the Order ID passed from the client
    const reference = `ORD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    this.logger.log(`Initiating checkout for ${reference} via ${dto.gateway}`);

    // Safely call the gateway using the Circuit Breaker
    // If the provider is down, this throws instantly and bypasses the DB write
    const providerResult = await this.orchestrator.safeCreateIntent(
      dto.gateway,
      dto.amount,
      dto.currency,
      reference,
    );

    // Persist the PENDING intent to the database
    const paymentIntent = await this.prisma.paymentIntent.create({
      data: {
        reference,
        amount: dto.amount,
        currency: dto.currency.toUpperCase(),
        gateway: dto.gateway,
        customerEmail: dto.customerEmail,
        gatewayPaymentId: providerResult.gatewayPaymentId,
        status: 'PENDING',
      },
    });

    // Return the client secret so the frontend can render the payment form/iframe
    return {
      intentId: paymentIntent.id,
      reference: paymentIntent.reference,
      clientSecret: providerResult.clientSecret,
    };
  }
}
