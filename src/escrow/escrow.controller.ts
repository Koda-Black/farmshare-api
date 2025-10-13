import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../constant';
import {
  ReleaseEscrowDto,
  PartialReleaseDto,
  ManualReleaseDto,
  ManualRefundDto,
} from './dto/escrow.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Escrow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('escrow')
export class EscrowController {
  constructor(private escrowService: EscrowService) {}

  @Get(':poolId')
  async getEscrowDetails(@Param('poolId') poolId: string) {
    return this.escrowService.getEscrowDetails(poolId);
  }

  @Post('release')
  async releaseEscrow(@Body() dto: ReleaseEscrowDto) {
    return this.escrowService.releaseEscrow(dto.poolId, dto.reason);
  }

  @Post('partial-release')
  async partialRelease(@Body() dto: PartialReleaseDto) {
    return this.escrowService.partialRelease(dto.poolId, dto.releaseMap);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Post('admin/manual-release')
  async manualRelease(@Body() dto: ManualReleaseDto) {
    return this.escrowService.manualRelease(
      dto.poolId,
      dto.amount,
      dto.reason,
    );
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Post('admin/manual-refund')
  async manualRefund(@Body() dto: ManualRefundDto) {
    return this.escrowService.manualRefund(
      dto.transactionId,
      dto.amount,
      dto.reason,
    );
  }
}