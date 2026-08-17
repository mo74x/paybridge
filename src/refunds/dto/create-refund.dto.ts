/* eslint-disable @typescript-eslint/no-unsafe-call */
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateRefundDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01, { message: 'Refund amount must be at least 0.01' })
  amount?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
