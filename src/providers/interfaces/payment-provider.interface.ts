export interface PaymentIntentResult {
  gatewayPaymentId: string;
  clientSecret: string; // Used by frontends to complete the payment
  rawResponse: any;
}

export type GatewayPaymentStatus =
  'CAPTURED' | 'FAILED' | 'PENDING' | 'REFUNDED' | 'AUTHORIZED';

export interface RefundResult {
  gatewayRefundId: string;
  status: 'SUCCEEDED' | 'PENDING' | 'FAILED';
  amount: number;
  currency: string;
  rawResponse: any;
}

export interface IPaymentProvider {
  // Initiates a payment session with the external gateway.
  createIntent(
    amount: number,
    currency: string,
    reference: string,
  ): Promise<PaymentIntentResult>;

  // Validates the cryptographic signature of incoming webhooks.
  verifyWebhookSignature(payload: any, signature: string): boolean;

  // Handles the business logic of an incoming payment event.
  handlePaymentEvent(event: any): Promise<void>;

  // Polls the external gateway API to retrieve current transaction status for reconciliation
  fetchPaymentStatus(gatewayPaymentId: string): Promise<GatewayPaymentStatus>;

  // Executes a full or partial refund with the external gateway
  refund(
    gatewayPaymentId: string,
    amount: number,
    currency: string,
    reason?: string,
  ): Promise<RefundResult>;
}
