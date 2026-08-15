import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProvidersModule } from './providers/providers.module';
import { ResilienceModule } from './common/resilience/resilience.module';

@Module({
  imports: [ProvidersModule, ResilienceModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
