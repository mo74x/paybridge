import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export class UpdateMerchantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUrl({}, { message: 'webhookUrl must be a valid URL' })
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
