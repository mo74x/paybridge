/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import {
  OutboundEventType,
  OutboundWebhookJobData,
  PaymentEventPayload,
  PaymentIntentData,
} from './interfaces/outbound-webhook.interface';

export const OUTBOUND_WEBHOOKS_QUEUE = 'paybridge-outbound-webhooks';

@Injectable()
export class OutboundWebhooksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboundWebhooksService.name);
  private queue!: Queue<OutboundWebhookJobData>;

  onModuleInit() {
    const redisHost = process.env.REDIS_HOST ?? 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT ?? '6379', 10);

    this.queue = new Queue<OutboundWebhookJobData>(OUTBOUND_WEBHOOKS_QUEUE, {
      connection: {
        host: redisHost,
        port: redisPort,
      },
    });

    this.logger.log(
      `Initialized BullMQ Queue: ${OUTBOUND_WEBHOOKS_QUEUE} (Redis @ ${redisHost}:${redisPort})`,
    );
  }

  async dispatchPaymentEvent(
    eventType: OutboundEventType | string,
    intentData: PaymentIntentData,
    targetUrl?: string,
    customSecret?: string,
  ): Promise<void> {
    const resolvedUrl =
      targetUrl ??
      process.env.MERCHANT_WEBHOOK_URL ??
      'http://localhost:4000/webhook';

    const secret =
      customSecret ??
      process.env.WEBHOOK_SIGNING_SECRET ??
      'pb_whsec_dev_secret_key_12345';

    const eventPayload: PaymentEventPayload = {
      id: `evt_${crypto.randomUUID()}`,
      event: eventType,
      timestamp: Date.now(),
      data: intentData,
    };

    const jobData: OutboundWebhookJobData = {
      intentId: intentData.id,
      targetUrl: resolvedUrl,
      secret,
      payload: eventPayload,
    };

    this.logger.log(
      `Enqueueing outbound webhook [${eventType}] for intent ${intentData.id} -> ${resolvedUrl}`,
    );

    await this.queue.add(eventType, jobData, {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000, // 2s, 4s, 8s, 16s, 32s
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  async onModuleDestroy() {
    if (this.queue) {
      await this.queue.close();
      this.logger.log(`Closed BullMQ Queue: ${OUTBOUND_WEBHOOKS_QUEUE}`);
    }
  }
}
