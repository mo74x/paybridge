/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrchestratorService } from '../providers/orchestrator/orchestrator.service';
import { OutboundWebhooksService } from '../outbound-webhooks/outbound-webhooks.service';
import { ReconciliationSummary } from './interfaces/reconciliation.interface';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: OrchestratorService,
    private readonly outboundWebhooks: OutboundWebhooksService,
  ) {}

  async reconcileStaleIntents(): Promise<ReconciliationSummary> {
    const thresholdMinutes = parseInt(
      process.env.RECONCILIATION_THRESHOLD_MINUTES ?? '15',
      10,
    );
    const cutoffDate = new Date(Date.now() - thresholdMinutes * 60 * 1000);

    this.logger.log(
      `Starting payment reconciliation for PENDING intents older than ${thresholdMinutes} minutes (created before ${cutoffDate.toISOString()})`,
    );

    const staleIntents = await this.prisma.paymentIntent.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lte: cutoffDate },
      },
    });

    const summary: ReconciliationSummary = {
      scanned: staleIntents.length,
      captured: 0,
      failed: 0,
      unchanged: 0,
      errors: [],
      executedAt: new Date().toISOString(),
    };

    if (staleIntents.length === 0) {
      this.logger.log('No stale PENDING intents found.');
      return summary;
    }

    this.logger.log(`Found ${staleIntents.length} stale intents to verify.`);

    for (const intent of staleIntents) {
      try {
        if (!intent.gatewayPaymentId) {
          // If no gatewayPaymentId and intent is > 24 hours old, mark FAILED (abandoned)
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          if (intent.createdAt < oneDayAgo) {
            await this.prisma.paymentIntent.update({
              where: { id: intent.id },
              data: { status: 'FAILED' },
            });
            summary.failed++;
          } else {
            summary.unchanged++;
          }
          continue;
        }

        // Inquire with payment provider directly
        const providerStatus = await this.orchestrator.fetchPaymentStatus(
          intent.gateway,
          intent.gatewayPaymentId,
        );

        if (providerStatus === 'CAPTURED') {
          const updated = await this.prisma.paymentIntent.update({
            where: { id: intent.id },
            data: { status: 'CAPTURED' },
          });

          this.logger.log(
            `✅ Reconciled intent ${intent.id} -> CAPTURED (Provider: ${intent.gateway})`,
          );

          // Dispatch outbound webhook to merchant since original inbound webhook was lost!
          await this.outboundWebhooks.dispatchPaymentEvent(
            'payment.succeeded',
            {
              id: updated.id,
              reference: updated.reference,
              amount: Number(updated.amount),
              currency: updated.currency,
              status: updated.status,
              gateway: updated.gateway,
              customerEmail: updated.customerEmail,
              gatewayPaymentId: updated.gatewayPaymentId,
            },
            updated.merchantId,
          );

          summary.captured++;
        } else if (providerStatus === 'FAILED') {
          const updated = await this.prisma.paymentIntent.update({
            where: { id: intent.id },
            data: { status: 'FAILED' },
          });

          this.logger.log(
            `❌ Reconciled intent ${intent.id} -> FAILED (Provider: ${intent.gateway})`,
          );

          await this.outboundWebhooks.dispatchPaymentEvent(
            'payment.failed',
            {
              id: updated.id,
              reference: updated.reference,
              amount: Number(updated.amount),
              currency: updated.currency,
              status: updated.status,
              gateway: updated.gateway,
              customerEmail: updated.customerEmail,
              gatewayPaymentId: updated.gatewayPaymentId,
            },
            updated.merchantId,
          );

          summary.failed++;
        } else {
          // Still PENDING at the gateway
          summary.unchanged++;
        }
      } catch (error: any) {
        const errorMsg = `Failed to reconcile intent ${intent.id}: ${error.message}`;
        this.logger.error(errorMsg);
        summary.errors.push(errorMsg);
      }
    }

    this.logger.log(
      `Reconciliation complete: Scanned=${summary.scanned}, Captured=${summary.captured}, Failed=${summary.failed}, Unchanged=${summary.unchanged}`,
    );

    return summary;
  }
}
