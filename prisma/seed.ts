/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Prisma Seed Script
 *
 * Seeds a default development merchant with a deterministic API key
 * so local development works out-of-the-box after migration.
 *
 * Usage: npx ts-node prisma/seed.ts
 */
const { PrismaClient } = require('../generated/prisma');
const crypto = require('crypto');

const prisma = new PrismaClient();

const DEV_API_KEY = 'pb_live_dev_default_key_for_local_testing_only';

function hashKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function getKeyPrefix(rawKey: string): string {
  return `${rawKey.substring(0, 8)}...${rawKey.substring(rawKey.length - 8)}`;
}

async function main() {
  console.log('🌱 Seeding PayBridge database...\n');

  // 1. Create or find default merchant
  const existingMerchant = await prisma.merchant.findUnique({
    where: { email: 'dev@paybridge.local' },
  });

  if (existingMerchant) {
    console.log(
      `✅ Default merchant already exists: ${existingMerchant.id} (${existingMerchant.name})`,
    );
    return;
  }

  const merchant = await prisma.merchant.create({
    data: {
      name: 'Default Development Merchant',
      email: 'dev@paybridge.local',
      webhookUrl:
        process.env.MERCHANT_WEBHOOK_URL ?? 'http://localhost:4000/webhook',
      webhookSecret:
        process.env.WEBHOOK_SIGNING_SECRET ?? 'pb_whsec_dev_secret_key_12345',
      isActive: true,
      apiKeys: {
        create: {
          keyHash: hashKey(DEV_API_KEY),
          keyPrefix: getKeyPrefix(DEV_API_KEY),
          label: 'Development Key',
          isActive: true,
        },
      },
    },
    include: { apiKeys: true },
  });

  console.log(`✅ Created default merchant:`);
  console.log(`   ID:    ${merchant.id}`);
  console.log(`   Name:  ${merchant.name}`);
  console.log(`   Email: ${merchant.email}`);
  console.log(`   Webhook URL: ${merchant.webhookUrl}`);
  console.log(`\n🔑 Development API Key:`);
  console.log(`   Key:    ${DEV_API_KEY}`);
  console.log(`   Prefix: ${merchant.apiKeys[0].keyPrefix}`);
  console.log(
    `\n   Use this key in the "x-api-key" header for local development.`,
  );

  // 2. Assign any orphaned PaymentIntents to the default merchant
  const orphanedCount = await prisma.paymentIntent.updateMany({
    where: { merchantId: null as any },
    data: { merchantId: merchant.id },
  });

  if (orphanedCount.count > 0) {
    console.log(
      `\n📋 Assigned ${orphanedCount.count} existing payment intent(s) to the default merchant.`,
    );
  }

  console.log('\n🌱 Seeding complete!');
}

main()
  .catch((e: Error) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
