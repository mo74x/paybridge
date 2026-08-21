import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { MerchantsService } from '../../merchants/merchants.service';

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
  constructor(private readonly merchantsService: MerchantsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    // Look up the merchant by hashed API key
    const merchant = await this.merchantsService.findMerchantByApiKey(apiKey);

    if (!merchant) {
      throw new UnauthorizedException('Invalid API key.');
    }

    if (!merchant.isActive) {
      throw new UnauthorizedException('Merchant account is deactivated.');
    }

    // Attach merchant context to the request for downstream controllers
    request.merchant = {
      id: merchant.id,
      name: merchant.name,
      key: apiKey,
    };

    return true;
  }
}
