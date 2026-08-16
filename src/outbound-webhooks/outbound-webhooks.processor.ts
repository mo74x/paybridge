/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import * as crypto from 'crypto';
import { OutboundWebhookJobData } from './interfaces/outbound-webhook.interface';
import { OUTBOUND_WEBHOOKS_QUEUE } from './outbound-webhooks.service';

@Injectable()
export class OutboundWebhooksProcessor
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OutboundWebhooksProcessor.name);
  private worker!: Worker<OutboundWebhookJobData>;

  onModuleInit() {
    const redisHost = process.env.REDIS_HOST ?? 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT ?? '6379', 10);

    this.worker = new Worker<OutboundWebhookJobData>(
      OUTBOUND_WEBHOOKS_QUEUE,
      async (job: Job<OutboundWebhookJobData>) => {
        await this.processWebhookDelivery(job);
      },
      {
        connection: {
          host: redisHost,
          port: redisPort,
        },
        concurrency: 5,
      },
    );

    this.worker.on('completed', (job: Job<OutboundWebhookJobData>) => {
      this.logger.log(
        `✅ Webhook job ${job.id} for intent ${job.data.intentId} delivered successfully to ${job.data.targetUrl}`,
      );
    });

    this.worker.on(
      'failed',
      (job: Job<OutboundWebhookJobData> | undefined, error: Error) => {
        const attempt = job?.attemptsMade ?? 0;
        const maxAttempts = job?.opts.attempts ?? 5;
        this.logger.warn(
          `⚠️ Webhook job ${job?.id} failed (Attempt ${attempt}/${maxAttempts}): ${error.message}`,
        );
      },
    );

    this.logger.log(
      `Initialized BullMQ Worker for queue: ${OUTBOUND_WEBHOOKS_QUEUE}`,
    );
  }

  async processWebhookDelivery(
    job: Job<OutboundWebhookJobData>,
  ): Promise<void> {
    const { targetUrl, secret, payload, intentId } = job.data;
    const serializedPayload = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);

    // Compute standard timestamped HMAC signature: t=<timestamp>,v1=<hex>
    const signature = this.generateSignature(
      serializedPayload,
      secret,
      timestamp,
    );

    this.logger.log(
      `Delivering outbound webhook [${payload.event}] for intent ${intentId} to ${targetUrl} (Attempt ${job.attemptsMade + 1})`,
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Paybridge-Webhook-Dispatcher/1.0',
          'x-paybridge-signature': signature,
          'x-paybridge-timestamp': timestamp.toString(),
        },
        body: serializedPayload,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Target webhook endpoint responded with HTTP status ${response.status} (${response.statusText})`,
        );
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`Webhook dispatch timed out after 10000ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  generateSignature(
    payload: string,
    secret: string,
    timestamp: number,
  ): string {
    const signaturePayload = `${timestamp}.${payload}`;
    const hmac = crypto
      .createHmac('sha256', secret)
      .update(signaturePayload)
      .digest('hex');

    return `t=${timestamp},v1=${hmac}`;
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
      this.logger.log(`Closed BullMQ Worker for: ${OUTBOUND_WEBHOOKS_QUEUE}`);
    }
  }
}
