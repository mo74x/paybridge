/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { OutboundWebhooksProcessor } from './outbound-webhooks.processor';
import { OutboundWebhookJobData } from './interfaces/outbound-webhook.interface';
import * as crypto from 'crypto';

describe('OutboundWebhooksProcessor', () => {
  let processor: OutboundWebhooksProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OutboundWebhooksProcessor],
    }).compile();

    processor = module.get<OutboundWebhooksProcessor>(
      OutboundWebhooksProcessor,
    );
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should correctly calculate timestamped HMAC signature', () => {
    const payload = JSON.stringify({ event: 'payment.succeeded' });
    const secret = 'test-secret';
    const timestamp = 1700000000;

    const signature = processor.generateSignature(payload, secret, timestamp);

    const expectedHmac = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    expect(signature).toBe(`t=${timestamp},v1=${expectedHmac}`);
  });

  it('should successfully deliver webhook via fetch and pass', async () => {
    const originalFetch = global.fetch;
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    global.fetch = mockFetch as any;

    const jobMock: any = {
      id: 'job-123',
      attemptsMade: 0,
      data: {
        intentId: 'uuid-123',
        targetUrl: 'http://localhost:4000/webhook',
        secret: 'test-secret',
        payload: {
          id: 'evt_1',
          event: 'payment.succeeded',
          timestamp: Date.now(),
          data: {
            id: 'uuid-123',
            reference: 'ORD-100',
            amount: 100,
            currency: 'USD',
            status: 'CAPTURED',
            gateway: 'STRIPE',
            customerEmail: 'test@example.com',
          },
        },
      } as OutboundWebhookJobData,
    };

    await processor.processWebhookDelivery(jobMock);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4000/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'User-Agent': 'Paybridge-Webhook-Dispatcher/1.0',
        }),
      }),
    );

    global.fetch = originalFetch;
  });

  it('should throw error when target webhook endpoint returns error status', async () => {
    const originalFetch = global.fetch;
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    global.fetch = mockFetch as any;

    const jobMock: any = {
      id: 'job-123',
      attemptsMade: 0,
      data: {
        intentId: 'uuid-123',
        targetUrl: 'http://localhost:4000/webhook',
        secret: 'test-secret',
        payload: {
          id: 'evt_1',
          event: 'payment.succeeded',
          timestamp: Date.now(),
          data: {
            id: 'uuid-123',
            reference: 'ORD-100',
            amount: 100,
            currency: 'USD',
            status: 'CAPTURED',
            gateway: 'STRIPE',
            customerEmail: 'test@example.com',
          },
        },
      } as OutboundWebhookJobData,
    };

    await expect(processor.processWebhookDelivery(jobMock)).rejects.toThrow(
      'Target webhook endpoint responded with HTTP status 500 (Internal Server Error)',
    );

    global.fetch = originalFetch;
  });
});
