import {
  Controller,
  Get,
  Patch,
  UseGuards,
  Req,
  Body,
  Post,
  UploadedFile,
  UseInterceptors,
  Query,
} from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';

@Controller('user')
export class UserController {
  constructor(private userService: UserService) {}

  @Get('vendors/top')
  @ApiOperation({ summary: 'Get top verified vendors' })
  @ApiQuery({ name: 'state', required: false, description: 'Filter by state' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of vendors to return',
  })
  getTopVendors(
    @Query('state') state?: string,
    @Query('limit') limit?: string,
  ) {
    return this.userService.getTopVendors(
      state,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('profile')
  @ApiOperation({ summary: 'Get own profile' })
  getProfile(@Req() req) {
    return this.userService.getProfile(req.user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch('update')
  @ApiOperation({ summary: 'Update own Name/Email' })
  updateProfile(@Req() req, @Body() dto: UpdateUserDto) {
    return this.userService.updateProfile(req.user.userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('avatar')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Upload avatar image' })
  uploadAvatar(@Req() req, @UploadedFile() file: Express.Multer.File) {
    return this.userService.uploadAvatar(req.user.userId, file);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('vendor')
  @Get('vendor-dashboard')
  getVendorDashboard() {
    // return this.vendorService.getDashboardData();
    return 'Vendor dashboard';
  }
}
