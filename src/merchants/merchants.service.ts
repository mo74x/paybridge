import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import * as crypto from 'crypto';

@Injectable()
export class MerchantsService {
  private readonly logger = new Logger(MerchantsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a random API key in the format: pb_live_<32 hex chars>
   */
  private generateRawKey(): string {
    return `pb_live_${crypto.randomBytes(32).toString('hex')}`;
  }

  /**
   * Returns a SHA-256 hex hash of the raw API key.
   */
  private hashKey(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey).digest('hex');
  }

  /**
   * Returns a safe display prefix like "pb_live_...a1b2c3d4"
   */
  private getKeyPrefix(rawKey: string): string {
    return `${rawKey.substring(0, 8)}...${rawKey.substring(rawKey.length - 8)}`;
  }

  /**
   * Creates a new merchant with an initial API key.
   * The full API key is returned ONLY at creation time.
   */
  async createMerchant(dto: CreateMerchantDto) {
    // Check for duplicate email
    const existing = await this.prisma.merchant.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException(
        `A merchant with email "${dto.email}" already exists.`,
      );
    }

    const rawKey = this.generateRawKey();
    const keyHash = this.hashKey(rawKey);
    const keyPrefix = this.getKeyPrefix(rawKey);

    const merchant = await this.prisma.merchant.create({
      data: {
        name: dto.name,
        email: dto.email,
        webhookUrl: dto.webhookUrl ?? null,
        webhookSecret:
          dto.webhookSecret ?? `pb_whsec_${crypto.randomBytes(16).toString('hex')}`,
        apiKeys: {
          create: {
            keyHash,
            keyPrefix,
            label: dto.keyLabel ?? 'Default Key',
          },
        },
      },
      include: {
        apiKeys: true,
      },
    });

    this.logger.log(`✅ Merchant created: ${merchant.id} (${merchant.name})`);

    return {
      merchant: {
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        webhookUrl: merchant.webhookUrl,
        isActive: merchant.isActive,
        createdAt: merchant.createdAt,
      },
      apiKey: {
        id: merchant.apiKeys[0].id,
        key: rawKey, // Only time the full key is revealed
        prefix: keyPrefix,
        label: merchant.apiKeys[0].label,
      },
    };
  }

  /**
   * Gets a merchant by ID with API key prefixes (never full keys).
   */
  async getMerchantById(id: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      include: {
        apiKeys: {
          select: {
            id: true,
            keyPrefix: true,
            label: true,
            isActive: true,
            lastUsedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant ${id} not found.`);
    }

    return merchant;
  }

  /**
   * Lists all merchants with pagination.
   */
  async listMerchants(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [merchants, total] = await Promise.all([
      this.prisma.merchant.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          createdAt: true,
          _count: { select: { paymentIntents: true } },
        },
      }),
      this.prisma.merchant.count(),
    ]);

    return {
      data: merchants,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Updates a merchant's settings.
   */
  async updateMerchant(id: string, dto: UpdateMerchantDto) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });

    if (!merchant) {
      throw new NotFoundException(`Merchant ${id} not found.`);
    }

    const updated = await this.prisma.merchant.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.webhookUrl !== undefined && { webhookUrl: dto.webhookUrl }),
        ...(dto.webhookSecret !== undefined && {
          webhookSecret: dto.webhookSecret,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    this.logger.log(`✅ Merchant updated: ${updated.id}`);

    return updated;
  }

  /**
   * Generates a new API key for a merchant. Returns the full key only once.
   */
  async rotateApiKey(merchantId: string, label?: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant ${merchantId} not found.`);
    }

    const rawKey = this.generateRawKey();
    const keyHash = this.hashKey(rawKey);
    const keyPrefix = this.getKeyPrefix(rawKey);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        merchantId,
        keyHash,
        keyPrefix,
        label: label ?? 'New Key',
      },
    });

    this.logger.log(
      `🔑 New API key generated for merchant ${merchantId}: ${keyPrefix}`,
    );

    return {
      id: apiKey.id,
      key: rawKey, // Only time the full key is revealed
      prefix: keyPrefix,
      label: apiKey.label,
      createdAt: apiKey.createdAt,
    };
  }

  /**
   * Revokes (deactivates) an API key.
   */
  async revokeApiKey(keyId: string) {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { id: keyId },
    });

    if (!apiKey) {
      throw new NotFoundException(`API key ${keyId} not found.`);
    }

    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });

    this.logger.log(`🔒 API key revoked: ${apiKey.keyPrefix}`);

    return { revoked: true, keyId };
  }

  /**
   * Finds a merchant by raw API key.
   * Hashes the incoming key and looks up the ApiKey table.
   * Updates lastUsedAt in the background.
   */
  async findMerchantByApiKey(rawKey: string) {
    const keyHash = this.hashKey(rawKey);

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        merchant: true,
      },
    });

    if (!apiKey || !apiKey.isActive) {
      return null;
    }

    if (!apiKey.merchant.isActive) {
      return null;
    }

    // Update lastUsedAt in the background (fire-and-forget)
    this.prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {
        /* swallow errors from background update */
      });

    return apiKey.merchant;
  }
}
