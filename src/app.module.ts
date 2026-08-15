import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProvidersModule } from './providers/providers.module';

@Module({
  imports: [ProvidersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
