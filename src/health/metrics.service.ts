/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CircuitBreakerService } from '../common/resilience/circuit-breaker/circuit-breaker.service';
import { GatewayProvider } from 'generated/prisma/enums';

@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  async getPrometheusMetrics(): Promise<string> {
    const lines: string[] = [];

    // System uptime and memory
    const uptime = process.uptime();
    const memory = process.memoryUsage();

    lines.push(
      '# HELP paybridge_process_uptime_seconds Process uptime in seconds',
    );
    lines.push('# TYPE paybridge_process_uptime_seconds gauge');
    lines.push(`paybridge_process_uptime_seconds ${uptime.toFixed(2)}`);

    lines.push(
      '# HELP paybridge_process_heap_bytes Process heap memory usage in bytes',
    );
    lines.push('# TYPE paybridge_process_heap_bytes gauge');
    lines.push(`paybridge_process_heap_bytes ${memory.heapUsed}`);

    // Circuit breaker states
    lines.push(
      '# HELP paybridge_circuit_breaker_open Circuit breaker open state (1 = open, 0 = closed)',
    );
    lines.push('# TYPE paybridge_circuit_breaker_open gauge');

    const cbStatuses = this.circuitBreaker.getAllBreakersStatus();
    for (const [gateway, status] of Object.entries(cbStatuses)) {
      const isOpen = status === 'OPEN' ? 1 : 0;
      lines.push(
        `paybridge_circuit_breaker_open{gateway="${gateway}"} ${isOpen}`,
      );
    }

    // Payment intent transaction counts and volumes
    try {
      const intents = await this.prisma.paymentIntent.findMany({
        select: {
          gateway: true,
          status: true,
          currency: true,
          amount: true,
        },
      });

      // Group counts
      const countsMap = new Map<string, number>();
      const volumeMap = new Map<string, number>();

      for (const intent of intents) {
        const key = `gateway="${intent.gateway}",status="${intent.status}",currency="${intent.currency}"`;
        countsMap.set(key, (countsMap.get(key) || 0) + 1);

        if (intent.status === 'CAPTURED' || intent.status === 'REFUNDED') {
          const volKey = `gateway="${intent.gateway}",currency="${intent.currency}"`;
          volumeMap.set(
            volKey,
            (volumeMap.get(volKey) || 0) + Number(intent.amount),
          );
        }
      }

      lines.push(
        '# HELP paybridge_payment_intents_total Total count of payment intents by gateway, status, and currency',
      );
      lines.push('# TYPE paybridge_payment_intents_total counter');
      for (const [labels, count] of countsMap.entries()) {
        lines.push(`paybridge_payment_intents_total{${labels}} ${count}`);
      }

      lines.push(
        '# HELP paybridge_payment_volume_total Total captured volume by gateway and currency',
      );
      lines.push('# TYPE paybridge_payment_volume_total counter');
      for (const [labels, vol] of volumeMap.entries()) {
        lines.push(
          `paybridge_payment_volume_total{${labels}} ${vol.toFixed(2)}`,
        );
      }

      // Refunds count
      const refunds = await this.prisma.refund.groupBy({
        by: ['status'],
        _count: { id: true },
      });

      lines.push(
        '# HELP paybridge_refunds_total Total count of refund operations by status',
      );
      lines.push('# TYPE paybridge_refunds_total counter');
      for (const r of refunds) {
        lines.push(
          `paybridge_refunds_total{status="${r.status}"} ${r._count.id}`,
        );
      }
    } catch {
      // If DB error, emit empty transaction metrics
    }

    return lines.join('\n') + '\n';
  }
}
