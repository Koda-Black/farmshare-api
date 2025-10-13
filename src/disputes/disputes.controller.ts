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
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { DisputesService } from './disputes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../constant';
import { CreateDisputeDto, ResolveDisputeDto } from './dto/dispute.dto';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';

@ApiTags('Disputes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('disputes')
export class DisputesController {
  constructor(private disputesService: DisputesService) {}

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

  @Get(':id')
  async getDispute(@Param('id') id: string) {
    return this.disputesService.getDisputeById(id);
  }

  @Get('pool/:poolId')
  async getPoolDisputes(@Param('poolId') poolId: string) {
    return this.disputesService.getDisputesByPool(poolId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
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
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Get('admin/pending')
  async getPendingDisputes() {
    return this.disputesService.getPendingDisputes();
  }
}
