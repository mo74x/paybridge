/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { OutboundWebhooksService } from './outbound-webhooks.service';

describe('OutboundWebhooksService', () => {
  let service: OutboundWebhooksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OutboundWebhooksService],
    }).compile();

    service = module.get<OutboundWebhooksService>(OutboundWebhooksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should format and enqueue event to BullMQ', async () => {
    const mockAdd = jest.fn().mockResolvedValue({ id: 'job_1' });
    (service as any).queue = { add: mockAdd };

    await service.dispatchPaymentEvent('payment.succeeded', {
      id: 'uuid-123',
      reference: 'ORD-100',
      amount: 50.0,
      currency: 'USD',
      status: 'CAPTURED',
      gateway: 'STRIPE',
      customerEmail: 'test@example.com',
    });

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith(
      'payment.succeeded',
      expect.objectContaining({
        intentId: 'uuid-123',
        payload: expect.objectContaining({
          event: 'payment.succeeded',
          data: expect.objectContaining({
            reference: 'ORD-100',
          }),
        }),
      }),
      expect.objectContaining({
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      }),
    );
  });
});
