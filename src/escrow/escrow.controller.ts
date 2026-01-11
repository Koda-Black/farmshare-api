import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
  ForbiddenException,
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
import { PrismaService } from '../services/prisma.service';

@ApiTags('Escrow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('escrow')
export class EscrowController {
  constructor(
    private escrowService: EscrowService,
    private prisma: PrismaService,
  ) {}

  @Get(':poolId')
  async getEscrowDetails(@Param('poolId') poolId: string, @Req() req) {
    // Authorization: Only pool vendor, admin, or pool subscribers can view escrow details
    const userId = req.user.userId;
    const isAdmin = req.user.role === 'ADMIN';

    const pool = await this.prisma.pool.findUnique({
      where: { id: poolId },
      include: {
        subscriptions: { select: { userId: true } },
      },
    });

    if (!pool) {
      throw new ForbiddenException('Pool not found');
    }

    const isVendor = pool.vendorId === userId;
    const isSubscriber = pool.subscriptions.some(
      (sub) => sub.userId === userId,
    );

    if (!isAdmin && !isVendor && !isSubscriber) {
      throw new ForbiddenException(
        'You are not authorized to view escrow details for this pool',
      );
    }

    return this.escrowService.getEscrowDetails(poolId);
  }

  @Post('release')
  async releaseEscrow(@Body() dto: ReleaseEscrowDto, @Req() req) {
    // Authorization: Only pool vendor or admin can release escrow
    const userId = req.user.userId;
    const isAdmin = req.user.role === 'ADMIN';

    const pool = await this.prisma.pool.findUnique({
      where: { id: dto.poolId },
    });

    if (!pool) {
      throw new ForbiddenException('Pool not found');
    }

    const isVendor = pool.vendorId === userId;

    if (!isAdmin && !isVendor) {
      throw new ForbiddenException(
        'Only pool vendor or admin can release escrow',
      );
    }

    return this.escrowService.releaseEscrow(dto.poolId, dto.reason);
  }

  @Post('partial-release')
  async partialRelease(@Body() dto: PartialReleaseDto, @Req() req) {
    // Authorization: Only pool vendor or admin can do partial release
    const userId = req.user.userId;
    const isAdmin = req.user.role === 'ADMIN';

    const pool = await this.prisma.pool.findUnique({
      where: { id: dto.poolId },
    });

    if (!pool) {
      throw new ForbiddenException('Pool not found');
    }

    const isVendor = pool.vendorId === userId;

    if (!isAdmin && !isVendor) {
      throw new ForbiddenException(
        'Only pool vendor or admin can do partial release',
      );
    }

    return this.escrowService.partialRelease(dto.poolId, dto.releaseMap);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/manual-release')
  async manualRelease(@Body() dto: ManualReleaseDto) {
    return this.escrowService.manualRelease(dto.poolId, dto.amount, dto.reason);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/manual-refund')
  async manualRefund(@Body() dto: ManualRefundDto) {
    return this.escrowService.manualRefund(
      dto.transactionId,
      dto.amount,
      dto.reason,
    );
  }
}
