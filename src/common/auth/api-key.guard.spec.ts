/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ApiKeyGuard } from './api-key.guard';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { MerchantsService } from '../../merchants/merchants.service';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let mockMerchantsService: Partial<MerchantsService>;

  const mockMerchant = {
    id: 'mch_test_123',
    name: 'Test Merchant',
    email: 'test@example.com',
    webhookUrl: 'http://localhost:4000/webhook',
    webhookSecret: 'whsec_test',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockMerchantsService = {
      findMerchantByApiKey: jest.fn(),
    };
    guard = new ApiKeyGuard(mockMerchantsService as MerchantsService);
  });

  const createMockContext = (
    headers: Record<string, string> = {},
  ): ExecutionContext => {
    const request = {
      headers,
      merchant: undefined,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  it('should throw UnauthorizedException when no API key is provided', async () => {
    const context = createMockContext({});
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException when an invalid API key is provided', async () => {
    (mockMerchantsService.findMerchantByApiKey as jest.Mock).mockResolvedValue(
      null,
    );
    const context = createMockContext({ 'x-api-key': 'invalid_key' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException when merchant is deactivated', async () => {
    (mockMerchantsService.findMerchantByApiKey as jest.Mock).mockResolvedValue({
      ...mockMerchant,
      isActive: false,
    });
    const context = createMockContext({ 'x-api-key': 'pb_live_valid_key' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should allow access and attach merchant context for a valid API key via x-api-key', async () => {
    (mockMerchantsService.findMerchantByApiKey as jest.Mock).mockResolvedValue(
      mockMerchant,
    );
    const context = createMockContext({ 'x-api-key': 'pb_live_valid_key' });
    const result = await guard.canActivate(context);
    expect(result).toBe(true);

    const request = context.switchToHttp().getRequest();
    expect(request.merchant).toEqual({
      id: mockMerchant.id,
      name: mockMerchant.name,
      key: 'pb_live_valid_key',
    });
  });

  it('should allow access via Authorization Bearer header', async () => {
    (mockMerchantsService.findMerchantByApiKey as jest.Mock).mockResolvedValue(
      mockMerchant,
    );
    const context = createMockContext({
      authorization: 'Bearer pb_live_bearer_key',
    });
    const result = await guard.canActivate(context);
    expect(result).toBe(true);

    const request = context.switchToHttp().getRequest();
    expect(request.merchant).toEqual({
      id: mockMerchant.id,
      name: mockMerchant.name,
      key: 'pb_live_bearer_key',
    });
  });
});
