/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/require-await */
import { Injectable, Logger } from '@nestjs/common';
import {
  IPaymentProvider,
  PaymentIntentResult,
} from './interfaces/payment-provider.interface';

@Injectable()
export class PaymobService implements IPaymentProvider {
  private readonly logger = new Logger(PaymobService.name);

  async createIntent(
    amount: number,
    currency: string,
    reference: string,
  ): Promise<PaymentIntentResult> {
    this.logger.log(
      `Initiating Paymob Payment Key generation for ${reference}`,
    );

    // Mocking Paymob's 3-step API:
    // fetch auth token -> register order -> get payment key
    const mockPaymobOrderId = `ord_paymob_${Date.now()}`;

    return {
      gatewayPaymentId: mockPaymobOrderId,
      clientSecret: `paymob_iframe_token_mock`,
      rawResponse: { order_id: mockPaymobOrderId, token: 'mock' },
    };
  }

  verifyWebhookSignature(payload: any, signature: string): boolean {
    // Mocking Paymob HMAC SHA512 verification
    return signature === 'valid-paymob-hmac';
  }

  handlePaymentEvent(event: any): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
