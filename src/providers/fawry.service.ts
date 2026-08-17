/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/require-await */
import { Injectable, Logger } from '@nestjs/common';
import {
  GatewayPaymentStatus,
  IPaymentProvider,
  PaymentIntentResult,
} from './interfaces/payment-provider.interface';

@Injectable()
export class FawryService implements IPaymentProvider {
  private readonly logger = new Logger(FawryService.name);

  async createIntent(
    amount: number,
    currency: string,
    reference: string,
  ): Promise<PaymentIntentResult> {
    this.logger.log(
      `Initiating Fawry reference code generation for ${reference}`,
    );

    // Mocking Fawry payment initiation (Reference Number / Payment Code generation)
    const mockFawryRefNumber = `fawry_ref_${Date.now()}`;

    return {
      gatewayPaymentId: mockFawryRefNumber,
      clientSecret: `fawry_checkout_token_mock`,
      rawResponse: {
        referenceNumber: mockFawryRefNumber,
        status: 'NEW',
        type: 'PAY_AT_FAWRY',
      },
    };
  }

  verifyWebhookSignature(payload: any, signature: string): boolean {
    // Mocking Fawry SHA256 / HMAC callback signature verification
    return signature === 'valid-fawry-signature';
  }

  async fetchPaymentStatus(
    gatewayPaymentId: string,
  ): Promise<GatewayPaymentStatus> {
    this.logger.log(
      `Polling Fawry Reference Inquiry API for ref: ${gatewayPaymentId}`,
    );

    // Mocking Fawry status inquiry: GET /ECommerceWeb/Fawry/payments/status/v2
    if (gatewayPaymentId.includes('fail')) {
      return 'FAILED';
    }
    return 'CAPTURED';
  }

  handlePaymentEvent(event: any): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
