/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  IsNumber,
  IsString,
  IsEmail,
  IsEnum,
  Min,
  Length,
} from 'class-validator';
import { GatewayProvider } from '../../../generated/prisma/enums';

export class CreateCheckoutSessionDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @Length(3, 3)
  currency: string;

  @IsEmail()
  customerEmail: string;

  @IsEnum(GatewayProvider, {
    message: 'Gateway must be one of: PAYMOB, STRIPE, FAWRY',
  })
  gateway: GatewayProvider;
}
