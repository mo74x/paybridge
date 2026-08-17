/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  IsNumber,
  IsString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsUrl,
  Min,
  Length,
} from 'class-validator';
import { GatewayProvider } from '../../../generated/prisma/enums';
import { RoutingStrategy } from '../../routing/routing.types';

export class CreateCheckoutSessionDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @Length(3, 3)
  currency: string;

  @IsEmail()
  customerEmail: string;

  @IsOptional()
  @IsEnum(GatewayProvider, {
    message: 'Gateway must be one of: PAYMOB, STRIPE, FAWRY',
  })
  gateway?: GatewayProvider;

  @IsOptional()
  @IsEnum(RoutingStrategy, {
    message:
      'routingStrategy must be one of: CURRENCY_OPTIMIZED, FEE_OPTIMIZED, LOWEST_LATENCY',
  })
  routingStrategy?: RoutingStrategy;

  @IsOptional()
  @IsUrl({}, { message: 'webhookUrl must be a valid URL' })
  webhookUrl?: string;
}
