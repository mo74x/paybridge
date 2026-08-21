import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { AdminGuard } from '../common/auth/admin.guard';

@Controller('api/v1/merchants')
@UseGuards(AdminGuard)
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createMerchant(@Body() dto: CreateMerchantDto) {
    return this.merchantsService.createMerchant(dto);
  }

  @Get()
  async listMerchants(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.merchantsService.listMerchants(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':id')
  async getMerchant(@Param('id') id: string) {
    return this.merchantsService.getMerchantById(id);
  }

  @Patch(':id')
  async updateMerchant(
    @Param('id') id: string,
    @Body() dto: UpdateMerchantDto,
  ) {
    return this.merchantsService.updateMerchant(id, dto);
  }

  @Post(':id/keys')
  @HttpCode(HttpStatus.CREATED)
  async generateApiKey(
    @Param('id') id: string,
    @Body('label') label?: string,
  ) {
    return this.merchantsService.rotateApiKey(id, label);
  }

  @Delete(':id/keys/:keyId')
  @HttpCode(HttpStatus.OK)
  async revokeApiKey(@Param('keyId') keyId: string) {
    return this.merchantsService.revokeApiKey(keyId);
  }
}
