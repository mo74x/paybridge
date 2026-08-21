import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { ApiKeyGuard } from '../common/auth/api-key.guard';

@Controller('api/v1/analytics')
@UseGuards(ApiKeyGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  async getOverview(@Query() query: AnalyticsQueryDto, @Req() req: Request) {
    return this.analyticsService.getOverview(query, req.merchant!.id);
  }
}
