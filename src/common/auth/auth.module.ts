import { Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { AdminGuard } from './admin.guard';
import { MerchantsModule } from '../../merchants/merchants.module';

@Module({
  imports: [MerchantsModule],
  providers: [ApiKeyGuard, AdminGuard],
  exports: [ApiKeyGuard, AdminGuard],
})
export class AuthModule {}
