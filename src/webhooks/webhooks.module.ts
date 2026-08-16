import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [ProvidersModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
