/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const idempotencyKey = request.headers['idempotency-key'] as
      string | undefined;

    // If no Idempotency-Key header is provided, proceed normally
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      return next.handle();
    }

    const key = idempotencyKey.trim();
    if (!key) {
      return next.handle();
    }

    const ttlSeconds = parseInt(
      process.env.IDEMPOTENCY_TTL_SECONDS ?? '86400',
      10,
    );
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // 1. Check if the key already exists
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { key },
    });

    if (existing) {
      // Check for expiration
      if (existing.expiresAt && existing.expiresAt < new Date()) {
        // Key expired -> clean up
        await this.prisma.idempotencyKey
          .delete({ where: { key } })
          .catch(() => null);
      } else if (existing.responseBody !== null) {
        // Cached complete response exists -> Replay!
        this.logger.log(
          `⚡ Idempotency key match [${key}]: Replaying cached response`,
        );
        response.setHeader('x-idempotent-replay', 'true');
        if (existing.statusCode) {
          response.status(existing.statusCode);
        }
        return of(existing.responseBody);
      } else {
        // Key exists but responseBody is null -> Request currently in flight
        this.logger.warn(
          `⚠️ Concurrent request with in-flight Idempotency-Key [${key}]`,
        );
        throw new ConflictException(
          'A request with this Idempotency-Key is currently being processed. Please retry shortly.',
        );
      }
    }

    // 2. Reserve the key (in-flight state)
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          key,
          expiresAt,
          statusCode: null,
          responseBody: undefined,
        },
      });
    } catch (error: any) {
      // Catch duplicate key insertion race condition (P2002)
      if (error?.code === 'P2002') {
        throw new ConflictException(
          'A request with this Idempotency-Key is currently being processed.',
        );
      }
      throw error;
    }

    // 3. Execute handler and cache the result
    return next.handle().pipe(
      tap({
        next: async (data) => {
          try {
            const statusCode = response.statusCode || 200;
            await this.prisma.idempotencyKey.update({
              where: { key },
              data: {
                statusCode,
                responseBody: data,
              },
            });
            this.logger.log(
              `💾 Cached response for Idempotency-Key [${key}] with status ${statusCode}`,
            );
          } catch (err: any) {
            this.logger.error(
              `Failed to persist idempotency cache for [${key}]: ${err.message}`,
            );
          }
        },
        error: async () => {
          // If execution fails, delete the in-flight lock so the client can retry
          await this.prisma.idempotencyKey
            .delete({ where: { key } })
            .catch(() => null);
        },
      }),
    );
  }
}
