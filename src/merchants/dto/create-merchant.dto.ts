import { IsEmail, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateMerchantDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsUrl({}, { message: 'webhookUrl must be a valid URL' })
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @IsOptional()
  @IsString()
  keyLabel?: string;
}
