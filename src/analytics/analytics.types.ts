import { GatewayProvider, PaymentStatus } from 'generated/prisma/enums';

export interface CurrencyVolume {
  currency: string;
  totalAmount: number;
  count: number;
}

export interface GatewayMetrics {
  gateway: GatewayProvider;
  totalTransactions: number;
  totalVolume: Record<string, number>;
  successfulTransactions: number;
  failedTransactions: number;
  pendingTransactions: number;
  successRate: number; // percentage 0 - 100
  failureRate: number; // percentage 0 - 100
}

export interface RefundMetrics {
  totalRefunds: number;
  totalRefundAmount: Record<string, number>;
}

export interface AnalyticsOverviewResponse {
  summary: {
    totalTransactions: number;
    successfulTransactions: number;
    failedTransactions: number;
    pendingTransactions: number;
    overallSuccessRate: number;
    overallConversionRate: number;
  };
  volumeByCurrency: CurrencyVolume[];
  gatewayBreakdown: Record<GatewayProvider, GatewayMetrics>;
  statusBreakdown: Record<PaymentStatus, number>;
  refunds: RefundMetrics;
}
