/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/await-thenable */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CircuitBreakerService } from '../common/resilience/circuit-breaker/circuit-breaker.service';
import Redis from 'ioredis';

export interface HealthIndicatorResult {
  status: 'UP' | 'DOWN';
  latencyMs?: number;
  message?: string;
  details?: any;
}

export interface SystemHealthReport {
  status: 'UP' | 'DEGRADED' | 'DOWN';
  timestamp: string;
  uptimeSeconds: number;
  services: {
    database: HealthIndicatorResult;
    redis: HealthIndicatorResult;
    circuitBreakers: {
      status: 'UP' | 'DEGRADED' | 'DOWN';
      breakers: Record<string, 'OPEN' | 'HALF_OPEN' | 'CLOSED'>;
    };
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  async checkHealth(): Promise<SystemHealthReport> {
    const [dbHealth, redisHealth, cbHealth] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkCircuitBreakers(),
    ]);

    let overallStatus: 'UP' | 'DEGRADED' | 'DOWN' = 'UP';

    if (dbHealth.status === 'DOWN' || redisHealth.status === 'DOWN') {
      overallStatus = 'DOWN';
    } else if (cbHealth.status === 'DEGRADED' || cbHealth.status === 'DOWN') {
      overallStatus = 'DEGRADED';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      services: {
        database: dbHealth,
        redis: redisHealth,
        circuitBreakers: cbHealth,
      },
    };
  }

  private async checkDatabase(): Promise<HealthIndicatorResult> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'UP',
        latencyMs: Date.now() - start,
      };
    } catch (error: any) {
      this.logger.error(`Database health check failed: ${error?.message}`);
      return {
        status: 'DOWN',
        latencyMs: Date.now() - start,
        message: error?.message || 'Database unreachable',
      };
    }
  }

  private async checkRedis(): Promise<HealthIndicatorResult> {
    const redisHost = process.env.REDIS_HOST ?? 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT ?? '6379', 10);
    const start = Date.now();

    let client: Redis | null = null;
    try {
      client = new Redis({
        host: redisHost,
        port: redisPort,
        connectTimeout: 2000,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });

      await client.connect();
      const pong = await client.ping();

      await client.quit().catch(() => {});

      if (pong === 'PONG') {
        return {
          status: 'UP',
          latencyMs: Date.now() - start,
        };
      }

      return {
        status: 'DOWN',
        latencyMs: Date.now() - start,
        message: `Unexpected response from Redis: ${pong}`,
      };
    } catch (error: any) {
      if (client) {
        client.disconnect();
      }
      return {
        status: 'DOWN',
        latencyMs: Date.now() - start,
        message: error?.message || 'Redis unreachable',
      };
    }
  }

  private checkCircuitBreakers(): {
    status: 'UP' | 'DEGRADED' | 'DOWN';
    breakers: Record<string, 'OPEN' | 'HALF_OPEN' | 'CLOSED'>;
  } {
    const statuses = this.circuitBreaker.getAllBreakersStatus();
    const breakerValues = Object.values(statuses);

    const openCount = breakerValues.filter((s) => s === 'OPEN').length;
    const totalCount = breakerValues.length;

    let cbStatus: 'UP' | 'DEGRADED' | 'DOWN' = 'UP';
    if (openCount === totalCount && totalCount > 0) {
      cbStatus = 'DOWN';
    } else if (openCount > 0) {
      cbStatus = 'DEGRADED';
    }

    return {
      status: cbStatus,
      breakers: statuses,
    };
  }
}
