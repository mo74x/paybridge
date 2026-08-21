/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrchestratorService } from '../providers/orchestrator/orchestrator.service';
import { SmartRoutingService } from '../routing/smart-routing.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout.dto';
import * as crypto from 'crypto';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: OrchestratorService,
    private readonly smartRouting: SmartRoutingService,
  ) {}

  async createSession(dto: CreateCheckoutSessionDto, merchantId: string) {
    // Generate a unique internal idempotency/reference key
    const reference = `ORD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    // 1. Resolve candidate gateway chain via Smart Routing Engine
    const routingResult = this.smartRouting.resolveRoute({
      amount: dto.amount,
      currency: dto.currency,
      preferredGateway: dto.gateway,
      strategy: dto.routingStrategy,
    });

    this.logger.log(
      `Initiating checkout session for ${reference} (${dto.amount} ${dto.currency.toUpperCase()}) with candidate route: [${routingResult.candidates.join(' -> ')}]`,
    );

    // 2. Safely call the gateway using Circuit Breaker with Automatic Failover
    const execution = await this.orchestrator.safeCreateIntentWithFallback(
      routingResult.candidates,
      dto.amount,
      dto.currency,
      reference,
    );

    // 3. Persist the PENDING intent to the database with the ACTUAL executed gateway
    const paymentIntent = await this.prisma.paymentIntent.create({
      data: {
        reference,
        amount: dto.amount,
        currency: dto.currency.toUpperCase(),
        gateway: execution.gateway,
        customerEmail: dto.customerEmail,
        gatewayPaymentId: execution.result.gatewayPaymentId,
        merchantId,
        status: 'PENDING',
      },
    });

    // 4. Return checkout details along with the resolved gateway
    return {
      intentId: paymentIntent.id,
      reference: paymentIntent.reference,
      gateway: execution.gateway,
      clientSecret: execution.result.clientSecret,
    };
  }
}
