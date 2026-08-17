/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/require-await */
import { Injectable, Logger } from '@nestjs/common';
import {
  GatewayPaymentStatus,
  IPaymentProvider,
  PaymentIntentResult,
  RefundResult,
} from './interfaces/payment-provider.interface';

@Injectable()
export class StripeService implements IPaymentProvider {
  private readonly logger = new Logger(StripeService.name);

  async createIntent(
    amount: number,
    currency: string,
    reference: string,
  ): Promise<PaymentIntentResult> {
    this.logger.log(`Initiating Stripe PaymentIntent for ${reference}`);

    // Mocking the Stripe SDK call: stripe.paymentIntents.create(...)
    const mockStripeId = `pi_stripe_${Date.now()}`;

    return {
      gatewayPaymentId: mockStripeId,
      clientSecret: `${mockStripeId}_secret_mock`,
      rawResponse: { id: mockStripeId, object: 'payment_intent' },
    };
  }

  verifyWebhookSignature(payload: any, signature: string): boolean {
    // Mocking Stripe signature verification: stripe.webhooks.constructEvent(...)
    return signature === 'valid-stripe-signature';
  }

  async fetchPaymentStatus(
    gatewayPaymentId: string,
  ): Promise<GatewayPaymentStatus> {
    this.logger.log(
      `Polling Stripe API for PaymentIntent status: ${gatewayPaymentId}`,
    );

    // Mocking stripe.paymentIntents.retrieve(gatewayPaymentId)
    if (gatewayPaymentId.includes('fail')) {
      return 'FAILED';
    }
    return 'CAPTURED';
  }

  async refund(
    gatewayPaymentId: string,
    amount: number,
    currency: string,
    reason?: string,
  ): Promise<RefundResult> {
    this.logger.log(
      `Executing Stripe refund of ${amount} ${currency} for PaymentIntent: ${gatewayPaymentId} (Reason: ${reason ?? 'N/A'})`,
    );

    // Mocking stripe.refunds.create({ payment_intent: gatewayPaymentId, amount: amount * 100 })
    const mockRefundId = `re_stripe_${Date.now()}`;

    return {
      gatewayRefundId: mockRefundId,
      status: 'SUCCEEDED',
      amount,
      currency,
      rawResponse: {
        id: mockRefundId,
        object: 'refund',
        amount,
        status: 'succeeded',
        payment_intent: gatewayPaymentId,
      },
    };
  }

  handlePaymentEvent(event: any): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
