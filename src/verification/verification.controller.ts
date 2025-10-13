import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Req,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { VerificationService } from './verification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../constant';
import {
  StartVerificationDto,
  SubmitVerificationDto,
  OverrideVerificationDto,
} from './dto/start-verification.dto';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';

@ApiTags('Verification')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('verification')
export class VerificationController {
  constructor(private verificationService: VerificationService) {}

  @Post('start')
  async startVerification(@Body() dto: StartVerificationDto, @Req() req) {
    return this.verificationService.startVerification(
      dto.userId || req.user.userId,
      dto.steps,
    );
  }

  @Post('submit')
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        verificationId: { type: 'string' },
        metadata: { type: 'object' },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  async submitVerification(
    @Body() dto: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req,
  ) {
    return this.verificationService.submitVerification(
      dto.verificationId,
      files,
      dto.metadata ? JSON.parse(dto.metadata) : {},
      req.user.userId,
    );
  }

  @Get('status')
  async getVerificationStatus(@Query('userId') userId: string, @Req() req) {
    return this.verificationService.getVerificationStatus(
      userId || req.user.userId,
    );
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Post('admin/override')
  async overrideVerification(@Body() dto: OverrideVerificationDto) {
    return this.verificationService.adminOverride(
      dto.userId,
      dto.status,
      dto.reason,
    );
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Get('admin/pending')
  async getPendingVerifications(
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 20,
  ) {
    return this.verificationService.getPendingVerifications(skip, take);
  }
}
