import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * Guard for admin-only endpoints (merchant management).
 * Validates the static DEV_MASTER_API_KEY from environment.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const headerKey = request.headers['x-api-key'] as string | undefined;
    const authHeader = request.headers['authorization'];

    let apiKey = headerKey;
    if (!apiKey && authHeader && authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7).trim();
    }

    if (!apiKey) {
      throw new UnauthorizedException(
        'Missing API key. Provide it via "x-api-key" header or "Authorization: Bearer <key>".',
      );
    }

    const adminKey =
      process.env.DEV_MASTER_API_KEY ?? 'pb_test_live_key_998877';

    if (apiKey !== adminKey) {
      throw new UnauthorizedException(
        'Invalid admin API key. This endpoint requires administrator access.',
      );
    }

    return true;
  }
}
