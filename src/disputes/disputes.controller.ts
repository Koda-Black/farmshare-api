import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { DisputesService } from './disputes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../constant';
import { CreateDisputeDto, ResolveDisputeDto } from './dto/dispute.dto';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { PrismaService } from '../services/prisma.service';

@ApiTags('Disputes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('disputes')
export class DisputesController {
  constructor(
    private disputesService: DisputesService,
    private prisma: PrismaService,
  ) {}

  @Post('create')
  @UseInterceptors(FilesInterceptor('files', 5))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        poolId: { type: 'string' },
        reason: { type: 'string' },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  async createDispute(
    @Body() dto: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req,
  ) {
    return this.disputesService.createDispute(
      dto.poolId,
      req.user.userId,
      dto.reason,
      files,
    );
  }

  @Get('user/:userId')
  async getUserDisputes(@Param('userId') userId: string, @Req() req) {
    // Allow users to view their own disputes or admins to view any user's disputes
    const requestingUserId = req.user.userId;
    if (userId !== requestingUserId && req.user.role !== 'ADMIN') {
      throw new Error('Unauthorized to view other user disputes');
    }
    return this.disputesService.getDisputesByUser(userId);
  }

  @Get('my')
  async getMyDisputes(@Req() req) {
    return this.disputesService.getDisputesByUser(req.user.userId);
  }

  @Get(':id')
  async getDispute(@Param('id') id: string, @Req() req) {
    const dispute = await this.disputesService.getDisputeById(id);

    // Authorization: Only raiser, pool vendor, or admin can view dispute
    const userId = req.user.userId;
    const isAdmin = req.user.role === 'ADMIN';
    const isRaiser = dispute.raisedByUserId === userId;
    const isVendor = dispute.pool.vendorId === userId;

    if (!isAdmin && !isRaiser && !isVendor) {
      throw new ForbiddenException(
        'You are not authorized to view this dispute',
      );
    }

    return dispute;
  }

  @Get('pool/:poolId')
  async getPoolDisputes(@Param('poolId') poolId: string, @Req() req) {
    // Authorization: Only pool vendor or admin can view all disputes for a pool
    const userId = req.user.userId;
    const isAdmin = req.user.role === 'ADMIN';

    const pool = await this.prisma.pool.findUnique({
      where: { id: poolId },
      select: { vendorId: true },
    });

    if (!pool) {
      throw new ForbiddenException('Pool not found');
    }

    const isVendor = pool.vendorId === userId;

    // Also check if user is a raiser of any dispute in this pool
    const userDispute = await this.prisma.dispute.findFirst({
      where: { poolId, raisedByUserId: userId },
    });
    const isRaiser = !!userDispute;

    if (!isAdmin && !isVendor && !isRaiser) {
      throw new ForbiddenException(
        'You are not authorized to view disputes for this pool',
      );
    }

    return this.disputesService.getDisputesByPool(poolId);
  }

  /**
   * Raiser marks dispute as resolved from their side
   * When both raiser and vendor mark as resolved, dispute auto-resolves
   */
  @Post(':id/raiser-resolve')
  async raiserResolve(@Param('id') id: string, @Req() req) {
    const dispute = await this.disputesService.getDisputeById(id);

    // Authorization: Only the raiser can mark their resolution
    if (dispute.raisedByUserId !== req.user.userId) {
      throw new ForbiddenException(
        'Only the dispute raiser can mark this as resolved',
      );
    }

    return this.disputesService.markRaiserResolved(id, req.user.userId);
  }

  /**
   * Vendor marks dispute as resolved from their side
   * When both raiser and vendor mark as resolved, dispute auto-resolves
   */
  @Post(':id/vendor-resolve')
  async vendorResolve(@Param('id') id: string, @Req() req) {
    const dispute = await this.disputesService.getDisputeById(id);

    // Authorization: Only the pool vendor can mark their resolution
    if (dispute.pool.vendorId !== req.user.userId) {
      throw new ForbiddenException(
        'Only the pool vendor can mark this as resolved',
      );
    }

    return this.disputesService.markVendorResolved(id, req.user.userId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/resolve')
  async resolveDispute(@Body() dto: ResolveDisputeDto, @Req() req) {
    return this.disputesService.resolveDispute(
      dto.disputeId,
      dto.action,
      dto.distribution,
      dto.resolutionNotes,
      req.user.userId,
    );
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/pending')
  async getPendingDisputes() {
    return this.disputesService.getPendingDisputes();
  }
}
