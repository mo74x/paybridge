import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';
import { MetricsService } from './metrics.service';

@Controller()
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly metricsService: MetricsService,
  ) {}

  @Get(['health', 'api/v1/health'])
  async getHealth(@Res() res: Response) {
    const report = await this.healthService.checkHealth();
    const statusCode =
      report.status === 'DOWN' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK;
    return res.status(statusCode).json(report);
  }

  @Get(['metrics', 'api/v1/metrics'])
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @HttpCode(HttpStatus.OK)
  async getMetrics(): Promise<string> {
    return this.metricsService.getPrometheusMetrics();
  }
}
