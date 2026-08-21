/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GatewayProvider, PaymentStatus } from 'generated/prisma/enums';
import {
  AnalyticsOverviewResponse,
  CurrencyVolume,
  GatewayMetrics,
  RefundMetrics,
} from './analytics.types';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(
    query: AnalyticsQueryDto = {},
    merchantId?: string,
  ): Promise<AnalyticsOverviewResponse> {
    const whereClause: any = {};

    if (merchantId) {
      whereClause.merchantId = merchantId;
    }

    if (query.from || query.to) {
      whereClause.createdAt = {};
      if (query.from) {
        whereClause.createdAt.gte = new Date(query.from);
      }
      if (query.to) {
        whereClause.createdAt.lte = new Date(query.to);
      }
    }

    if (query.gateway) {
      whereClause.gateway = query.gateway;
    }

    // Fetch all relevant PaymentIntents along with refunds
    const intents = await this.prisma.paymentIntent.findMany({
      where: whereClause,
      include: {
        refunds: true,
      },
    });

    const totalTransactions = intents.length;
    let successfulTransactions = 0;
    let failedTransactions = 0;
    let pendingTransactions = 0;

    const volumeByCurrencyMap = new Map<
      string,
      { totalAmount: number; count: number }
    >();

    const statusBreakdown: Record<PaymentStatus, number> = {
      [PaymentStatus.PENDING]: 0,
      [PaymentStatus.AUTHORIZED]: 0,
      [PaymentStatus.CAPTURED]: 0,
      [PaymentStatus.FAILED]: 0,
      [PaymentStatus.REFUNDED]: 0,
    };

    const initialGatewayMetric = (
      gateway: GatewayProvider,
    ): GatewayMetrics => ({
      gateway,
      totalTransactions: 0,
      totalVolume: {},
      successfulTransactions: 0,
      failedTransactions: 0,
      pendingTransactions: 0,
      successRate: 0,
      failureRate: 0,
    });

    const gatewayBreakdown: Record<GatewayProvider, GatewayMetrics> = {
      [GatewayProvider.STRIPE]: initialGatewayMetric(GatewayProvider.STRIPE),
      [GatewayProvider.PAYMOB]: initialGatewayMetric(GatewayProvider.PAYMOB),
      [GatewayProvider.FAWRY]: initialGatewayMetric(GatewayProvider.FAWRY),
    };

    let totalRefundsCount = 0;
    const totalRefundAmountMap: Record<string, number> = {};

    for (const intent of intents) {
      const amount = Number(intent.amount);
      const currency = intent.currency;
      const gateway = intent.gateway;
      const status = intent.status;

      // Status breakdown
      if (statusBreakdown[status] !== undefined) {
        statusBreakdown[status]++;
      }

      // Success vs failure classification
      const isSuccess =
        status === PaymentStatus.CAPTURED || status === PaymentStatus.REFUNDED;
      const isFailed = status === PaymentStatus.FAILED;
      const isPending =
        status === PaymentStatus.PENDING || status === PaymentStatus.AUTHORIZED;

      if (isSuccess) successfulTransactions++;
      if (isFailed) failedTransactions++;
      if (isPending) pendingTransactions++;

      // Volume by currency
      const currentCurrencyVolume = volumeByCurrencyMap.get(currency) || {
        totalAmount: 0,
        count: 0,
      };
      currentCurrencyVolume.count++;
      if (isSuccess) {
        currentCurrencyVolume.totalAmount =
          Math.round((currentCurrencyVolume.totalAmount + amount) * 100) / 100;
      }
      volumeByCurrencyMap.set(currency, currentCurrencyVolume);

      // Gateway breakdown
      if (gatewayBreakdown[gateway]) {
        const gw = gatewayBreakdown[gateway];
        gw.totalTransactions++;
        if (isSuccess) {
          gw.successfulTransactions++;
          gw.totalVolume[currency] =
            Math.round(((gw.totalVolume[currency] || 0) + amount) * 100) / 100;
        }
        if (isFailed) gw.failedTransactions++;
        if (isPending) gw.pendingTransactions++;
      }

      // Refunds metrics
      if (intent.refunds && intent.refunds.length > 0) {
        for (const refund of intent.refunds) {
          if (refund.status === 'SUCCEEDED') {
            totalRefundsCount++;
            const refAmount = Number(refund.amount);
            totalRefundAmountMap[currency] =
              Math.round(
                ((totalRefundAmountMap[currency] || 0) + refAmount) * 100,
              ) / 100;
          }
        }
      }
    }

    // Compute rates for gateways
    for (const gateway of Object.values(GatewayProvider)) {
      const gw = gatewayBreakdown[gateway];
      const completed = gw.successfulTransactions + gw.failedTransactions;
      gw.successRate =
        completed > 0
          ? Math.round((gw.successfulTransactions / completed) * 10000) / 100
          : 0;
      gw.failureRate =
        completed > 0
          ? Math.round((gw.failedTransactions / completed) * 10000) / 100
          : 0;
    }

    const completedTotal = successfulTransactions + failedTransactions;
    const overallSuccessRate =
      completedTotal > 0
        ? Math.round((successfulTransactions / completedTotal) * 10000) / 100
        : 0;
    const overallConversionRate =
      totalTransactions > 0
        ? Math.round((successfulTransactions / totalTransactions) * 10000) / 100
        : 0;

    const volumeByCurrency: CurrencyVolume[] = Array.from(
      volumeByCurrencyMap.entries(),
    ).map(([currency, val]) => ({
      currency,
      totalAmount: val.totalAmount,
      count: val.count,
    }));

    const refunds: RefundMetrics = {
      totalRefunds: totalRefundsCount,
      totalRefundAmount: totalRefundAmountMap,
    };

    return {
      summary: {
        totalTransactions,
        successfulTransactions,
        failedTransactions,
        pendingTransactions,
        overallSuccessRate,
        overallConversionRate,
      },
      volumeByCurrency,
      gatewayBreakdown,
      statusBreakdown,
      refunds,
    };
  }
}
