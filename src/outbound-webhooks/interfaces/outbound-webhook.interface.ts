/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
export type OutboundEventType =
  'payment.succeeded' | 'payment.failed' | 'payment.captured';

export interface PaymentIntentData {
  id: string;
  reference: string;
  amount: number | string;
  currency: string;
  status: string;
  gateway: string;
  customerEmail: string;
  gatewayPaymentId?: string | null;
  [key: string]: any;
}

export interface PaymentEventPayload {
  id: string;
  event: OutboundEventType | string;
  timestamp: number;
  data: PaymentIntentData;
}

export interface OutboundWebhookJobData {
  intentId: string;
  targetUrl: string;
  secret: string;
  payload: PaymentEventPayload;
}
