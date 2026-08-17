/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  CallHandler,
  ConflictException,
  ExecutionContext,
} from '@nestjs/common';
import { of } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      idempotencyKey: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    interceptor = new IdempotencyInterceptor(mockPrisma);
  });

  const createMockContext = (
    headers: Record<string, string>,
  ): { context: ExecutionContext; response: any } => {
    const request = { headers };
    const response = {
      statusCode: 200,
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    return { context, response };
  };

  it('should pass through if no Idempotency-Key header is present', async () => {
    const { context } = createMockContext({});
    const next: CallHandler = { handle: () => of({ result: 'ok' }) };

    const observable = await interceptor.intercept(context, next);
    observable.subscribe((val) => {
      expect(val).toEqual({ result: 'ok' });
    });

    expect(mockPrisma.idempotencyKey.findUnique).not.toHaveBeenCalled();
  });

  it('should replay cached response if valid key exists in DB', async () => {
    const cachedData = { intentId: 'intent-123', clientSecret: 'secret_abc' };
    mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
      key: 'key-1',
      statusCode: 201,
      responseBody: cachedData,
      expiresAt: new Date(Date.now() + 100000),
    });

    const { context, response } = createMockContext({
      'idempotency-key': 'key-1',
    });
    const next: CallHandler = { handle: jest.fn() };

    const observable = await interceptor.intercept(context, next);
    observable.subscribe((val) => {
      expect(val).toEqual(cachedData);
      expect(response.setHeader).toHaveBeenCalledWith(
        'x-idempotent-replay',
        'true',
      );
      expect(response.status).toHaveBeenCalledWith(201);
    });

    expect(next.handle).not.toHaveBeenCalled();
  });

  it('should throw ConflictException if key is currently in-flight', async () => {
    mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
      key: 'key-1',
      statusCode: null,
      responseBody: null,
      expiresAt: new Date(Date.now() + 100000),
    });

    const { context } = createMockContext({ 'idempotency-key': 'key-1' });
    const next: CallHandler = { handle: jest.fn() };

    await expect(interceptor.intercept(context, next)).rejects.toThrow(
      ConflictException,
    );
  });

  it('should create in-flight record and cache completed response for a fresh key', async () => {
    mockPrisma.idempotencyKey.findUnique.mockResolvedValue(null);
    mockPrisma.idempotencyKey.create.mockResolvedValue({ key: 'key-new' });
    mockPrisma.idempotencyKey.update.mockResolvedValue({ key: 'key-new' });

    const { context } = createMockContext({ 'idempotency-key': 'key-new' });
    const handlerResponse = { intentId: 'intent-999' };
    const next: CallHandler = { handle: () => of(handlerResponse) };

    const observable = await interceptor.intercept(context, next);
    observable.subscribe((val) => {
      expect(val).toEqual(handlerResponse);
    });

    expect(mockPrisma.idempotencyKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: 'key-new',
        }),
      }),
    );
  });
});
