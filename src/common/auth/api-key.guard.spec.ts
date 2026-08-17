import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;

  beforeEach(() => {
    guard = new ApiKeyGuard();
    process.env.DEV_MASTER_API_KEY = 'test_key_123';
  });

  const createMockContext = (
    headers: Record<string, string>,
  ): ExecutionContext => {
    const request = { headers, merchant: undefined };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  it('should allow access with valid x-api-key header', () => {
    const context = createMockContext({ 'x-api-key': 'test_key_123' });
    const result = guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should allow access with valid Bearer token', () => {
    const context = createMockContext({ authorization: 'Bearer test_key_123' });
    const result = guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw UnauthorizedException when API key is missing', () => {
    const context = createMockContext({});
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when API key is invalid', () => {
    const context = createMockContext({ 'x-api-key': 'wrong_key' });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
