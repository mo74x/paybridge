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
      `Executing Fawry refund of ${amount} ${currency} for Reference Number: ${gatewayPaymentId} (Reason: ${reason ?? 'N/A'})`,
    );

    // Mocking Fawry refund API call: POST /ECommerceWeb/Fawry/payments/refund
    const mockRefundId = `ref_fawry_${Date.now()}`;

    return {
      gatewayRefundId: mockRefundId,
      status: 'SUCCEEDED',
      amount,
      currency,
      rawResponse: {
        refundId: mockRefundId,
        status: 'SUCCESS',
        refundAmount: amount,
        referenceNumber: gatewayPaymentId,
      },
    };
  }

  handlePaymentEvent(event: any): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
