import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../constant';
import { RolesGuard } from '../common/guards/roles.guard';
import { PoolsService } from './pools.service';
import { CreatePoolDto } from './dto/create-pool.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiTags, ApiQuery } from '@nestjs/swagger';

@ApiTags('Pools')
@Controller('pools')
export class PoolsController {
  constructor(private readonly poolsService: PoolsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  create(@Req() req, @Body() createPoolDto: CreatePoolDto) {
    return this.poolsService.create(createPoolDto, req.user.userId);
  }

  @Get()
  @ApiQuery({
    name: 'vendorId',
    required: false,
    description: 'Filter pools by vendor ID',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter pools by status',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filter pools by product category',
  })
  findAll(
    @Query('vendorId') vendorId?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
  ) {
    return this.poolsService.findAll({
      vendorId,
      status: status as any,
      category,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.poolsService.findOne(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('user/subscriptions')
  getUserSubscriptions(@Req() req) {
    return this.poolsService.getUserSubscriptions(req.user.id);
  }
}
