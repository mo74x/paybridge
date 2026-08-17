/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrchestratorService } from '../providers/orchestrator/orchestrator.service';
import { OutboundWebhooksService } from '../outbound-webhooks/outbound-webhooks.service';
import { CreateRefundDto } from './dto/create-refund.dto';

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: OrchestratorService,
    private readonly outboundWebhooks: OutboundWebhooksService,
  ) {}

  async processRefund(paymentIntentId: string, dto: CreateRefundDto) {
    this.logger.log(
      `Initiating refund for PaymentIntent: ${paymentIntentId} (Amount: ${dto.amount ?? 'FULL'})`,
    );

    // 1. Fetch the PaymentIntent along with any previous refunds
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: paymentIntentId },
      include: {
        refunds: true,
      },
    });

    if (!intent) {
      throw new NotFoundException(
        `Payment intent ${paymentIntentId} was not found.`,
      );
    }

    // 2. Validate PaymentIntent status
    if (intent.status !== 'CAPTURED') {
      throw new BadRequestException(
        `Cannot refund payment intent with status "${intent.status}". Only CAPTURED payments can be refunded.`,
      );
    }

    if (!intent.gatewayPaymentId) {
      throw new BadRequestException(
        'Cannot refund payment intent without a valid gatewayPaymentId.',
      );
    }

    // 3. Calculate remaining balance eligible for refund
    const totalAmount = Number(intent.amount);
    const totalRefundedSoFar = (intent.refunds || [])
      .filter((r: any) => r.status === 'SUCCEEDED')
      .reduce((sum: number, r: any) => sum + Number(r.amount), 0);

    const remainingBalance =
      Math.round((totalAmount - totalRefundedSoFar) * 100) / 100;

    if (remainingBalance <= 0) {
      throw new BadRequestException(
        `Payment intent ${paymentIntentId} has already been fully refunded.`,
      );
    }

    // 4. Determine refund amount (full vs partial)
    const requestedAmount =
      dto.amount !== undefined ? Number(dto.amount) : remainingBalance;

    if (requestedAmount <= 0) {
      throw new BadRequestException('Refund amount must be greater than 0.');
    }

    if (requestedAmount > remainingBalance) {
      throw new BadRequestException(
        `Requested refund amount (${requestedAmount} ${intent.currency}) exceeds remaining balance (${remainingBalance} ${intent.currency}).`,
      );
    }

    // 5. Execute external refund with payment provider
    const refundResult = await this.orchestrator.refund(
      intent.gateway,
      intent.gatewayPaymentId,
      requestedAmount,
      intent.currency,
      dto.reason,
    );

    const isFullyRefunded =
      Math.round((totalRefundedSoFar + requestedAmount) * 100) / 100 >=
      totalAmount;

    // 6. Record refund in database & update PaymentIntent if fully refunded
    const newRefund = await this.prisma.$transaction(async (tx: any) => {
      const createdRefund = await tx.refund.create({
        data: {
          paymentIntentId: intent.id,
          amount: requestedAmount,
          reason: dto.reason ?? null,
          status: refundResult.status,
          gatewayRefundId: refundResult.gatewayRefundId,
        },
      });

      if (isFullyRefunded && refundResult.status === 'SUCCEEDED') {
        await tx.paymentIntent.update({
          where: { id: intent.id },
          data: { status: 'REFUNDED' },
        });
      }

      return createdRefund;
    });

    this.logger.log(
      `✅ Refund created successfully: ${newRefund.id} (Amount: ${requestedAmount} ${intent.currency}, FullyRefunded: ${isFullyRefunded})`,
    );

    // 7. Dispatch outbound webhook event: payment.refunded
    await this.outboundWebhooks.dispatchPaymentEvent('payment.refunded', {
      id: intent.id,
      reference: intent.reference,
      amount: Number(intent.amount),
      currency: intent.currency,
      status: isFullyRefunded ? 'REFUNDED' : 'CAPTURED',
      gateway: intent.gateway,
      customerEmail: intent.customerEmail,
      gatewayPaymentId: intent.gatewayPaymentId,
      refund: {
        id: newRefund.id,
        amount: requestedAmount,
        reason: dto.reason,
        gatewayRefundId: refundResult.gatewayRefundId,
        status: refundResult.status,
        remainingBalance: Math.max(0, remainingBalance - requestedAmount),
      },
    });

    return {
      refundId: newRefund.id,
      paymentIntentId: intent.id,
      amount: requestedAmount,
      currency: intent.currency,
      status: newRefund.status,
      gatewayRefundId: newRefund.gatewayRefundId,
      remainingBalance: Math.max(0, remainingBalance - requestedAmount),
      isFullyRefunded,
    };
  }

  async getRefundsByIntentId(paymentIntentId: string) {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: paymentIntentId },
      include: { refunds: true },
    });

    if (!intent) {
      throw new NotFoundException(
        `Payment intent ${paymentIntentId} was not found.`,
      );
    }

    return {
      paymentIntentId: intent.id,
      reference: intent.reference,
      totalAmount: Number(intent.amount),
      currency: intent.currency,
      status: intent.status,
      refunds: intent.refunds,
    };
  }
}
