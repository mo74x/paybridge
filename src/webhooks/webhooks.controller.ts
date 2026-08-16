/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import * as common from '@nestjs/common';
import type { Request, Response } from 'express';
import { GatewayProvider } from '../../generated/prisma/enums';
import { OrchestratorService } from '../providers/orchestrator/orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboundWebhooksService } from '../outbound-webhooks/outbound-webhooks.service';

@common.Controller('api/v1/webhooks')
export class WebhooksController {
  private readonly logger = new common.Logger(WebhooksController.name);

  constructor(
    private readonly orchestrator: OrchestratorService,
    private readonly prisma: PrismaService,
    private readonly outboundWebhooks: OutboundWebhooksService,
  ) {}

  @common.Post(':gateway')
  async handleIncomingWebhook(
    @common.Param('gateway') gatewayParam: string,
    @common.Headers() headers: Record<string, string | undefined>,
    @common.Req() req: common.RawBodyRequest<Request>,
    @common.Res() res: Response,
  ) {
    const gateway = gatewayParam.toUpperCase() as GatewayProvider;

    // Resolve the correct provider strategy
    const provider = this.orchestrator.getProvider(gateway);

    // Extract the provider-specific signature header
    // Stripe uses 'stripe-signature', Paymob uses 'hmac'
    const signature =
      gateway === GatewayProvider.STRIPE
        ? headers['stripe-signature']
        : headers['hmac'];

    if (!signature) {
      throw new common.UnauthorizedException(
        'Missing webhook signature header',
      );
    }

    // Verify the Cryptographic Signature using the Strategy Pattern
    // We pass the raw unparsed buffer, as parsing it alters the byte hash
    const rawBodyBuffer = req.rawBody;
    const isValid = provider.verifyWebhookSignature(rawBodyBuffer, signature);

    if (!isValid) {
      this.logger.error(`🚨 Webhook spoofing attempt detected for ${gateway}`);
      throw new common.UnauthorizedException('Invalid webhook signature');
    }

    // Extract the unique event ID from the payload to prevent replays
    const payload = JSON.parse(
      rawBodyBuffer ? rawBodyBuffer.toString('utf8') : '{}',
    );

    // Providers use different fields for their unique event IDs
    const providerEventId =
      gateway === GatewayProvider.STRIPE
        ? payload.id
        : payload.obj.id.toString();
    const paymentIntentId =
      gateway === GatewayProvider.STRIPE
        ? payload.data.object.id
        : payload.obj.order.id.toString();

    try {
      // Database-Level Idempotency (Replay Protection)
      // By using an interactive transaction and attempting to create the event record,
      // the PostgreSQL unique constraint on 'providerEventId' guarantees we only process this once.
      const updatedIntent = await this.prisma.$transaction(async (tx) => {
        // Attempt to record the event. If it exists, Prisma throws a P2002 Unique Constraint error.
        await tx.webhookEvent.create({
          data: {
            paymentIntentId,
            providerEventId,
            payload,
          },
        });

        // If the insert succeeds, we know this is a brand new event.
        // We can safely update the business logic.
        return await tx.paymentIntent.update({
          where: { id: paymentIntentId },
          data: { status: 'CAPTURED' },
        });
      });

      this.logger.log(
        `✅ Webhook processed successfully for Intent: ${paymentIntentId}`,
      );

      // Asynchronously dispatch outbound webhook to notify the merchant via BullMQ queue
      await this.outboundWebhooks.dispatchPaymentEvent('payment.succeeded', {
        id: updatedIntent.id,
        reference: updatedIntent.reference,
        amount: Number(updatedIntent.amount),
        currency: updatedIntent.currency,
        status: updatedIntent.status,
        gateway: updatedIntent.gateway,
        customerEmail: updatedIntent.customerEmail,
        gatewayPaymentId: updatedIntent.gatewayPaymentId,
      });

      // Always return a 200 immediately to stop the provider from retrying
      return res.status(200).send({ received: true });
    } catch (error: any) {
      // Catch the Prisma Unique Constraint Violation
      if (error?.code === 'P2002') {
        this.logger.warn(
          `⚠️ Duplicate webhook received (Event ID: ${providerEventId}). Ignoring.`,
        );
        // Return 200 so the provider stops retrying this duplicate event
        return res.status(200).send({ received: true });
      }

      this.logger.error(`Webhook processing failed: ${error?.message}`);
      // Return 500 so the provider knows to retry later
      return res.status(500).send();
    }
  }
}
