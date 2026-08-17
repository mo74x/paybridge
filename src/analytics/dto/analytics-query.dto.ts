/* eslint-disable @typescript-eslint/no-unsafe-call */
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { GatewayProvider } from '../../../generated/prisma/enums';

export class AnalyticsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(GatewayProvider)
  gateway?: GatewayProvider;
}
