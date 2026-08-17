/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { ReconciliationService } from './reconciliation.service';

export const RECONCILIATION_QUEUE = 'paybridge-reconciliation';
const RECONCILIATION_JOB_NAME = 'sync-pending-payments';

@Injectable()
export class ReconciliationProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReconciliationProcessor.name);
  private queue!: Queue;
  private worker!: Worker;

  constructor(private readonly reconciliationService: ReconciliationService) {}

  async onModuleInit() {
    const redisHost = process.env.REDIS_HOST ?? 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT ?? '6379', 10);
    const intervalMs = parseInt(
      process.env.RECONCILIATION_INTERVAL_MS ?? '900000',
      10,
    );

    // 1. Initialize BullMQ Queue
    this.queue = new Queue(RECONCILIATION_QUEUE, {
      connection: {
        host: redisHost,
        port: redisPort,
      },
    });

    // 2. Schedule Repeatable Job
    try {
      await this.queue.upsertJobScheduler(
        'periodic-reconciliation-scheduler',
        {
          every: intervalMs,
        },
        {
          name: RECONCILIATION_JOB_NAME,
          data: {},
        },
      );
      this.logger.log(
        `⏰ Scheduled repeatable reconciliation cron every ${intervalMs / 1000}s on queue [${RECONCILIATION_QUEUE}]`,
      );
    } catch (err: any) {
      this.logger.warn(
        `Could not register repeatable scheduler: ${err.message}`,
      );
    }

    // 3. Initialize Worker
    this.worker = new Worker(
      RECONCILIATION_QUEUE,
      async () => {
        this.logger.log(
          'Executing scheduled background reconciliation cycle...',
        );
        await this.reconciliationService.reconcileStaleIntents();
      },
      {
        connection: {
          host: redisHost,
          port: redisPort,
        },
        concurrency: 1,
      },
    );

    this.worker.on('completed', () => {
      this.logger.log('Reconciliation cycle completed successfully.');
    });

    this.worker.on('failed', (_job, err) => {
      this.logger.error(`Reconciliation cycle failed: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    if (this.queue) {
      await this.queue.close();
    }
    if (this.worker) {
      await this.worker.close();
    }
    this.logger.log(`Closed BullMQ Reconciliation queue & worker.`);
  }
}
