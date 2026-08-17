import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

export interface AuthenticatedMerchant {
  id: string;
  name: string;
  key: string;
}

declare module 'express' {
  interface Request {
    merchant?: AuthenticatedMerchant;
  }
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // Extract API key from 'x-api-key' or 'Authorization: Bearer <key>'
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

    const masterKey =
      process.env.DEV_MASTER_API_KEY ?? 'pb_test_live_key_998877';

    // Validate the API key
    if (apiKey !== masterKey) {
      throw new UnauthorizedException('Invalid API key.');
    }

    // Attach merchant context to the request for downstream controllers
    request.merchant = {
      id: 'mch_master_default',
      name: 'Default Merchant',
      key: apiKey,
    };

    return true;
  }
}
