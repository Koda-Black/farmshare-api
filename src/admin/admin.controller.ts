import {
  Controller,
  Patch,
  Post,
  Get,
  Query,
  UseGuards,
  Req,
  Body,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../constant';
import { ModifyRoleDto, PaginationDto } from './dto/modify-role.dto';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Post('self-promote')
  @Roles(Role.USER, Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'Promote yourself to Admin if eligible' })
  selfPromote(@Req() req) {
    return this.adminService.elevateSelf(req.user.userId);
  }

  @Patch('users/role')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Change role of a user (admin or superadmin)' })
  modifyUserRole(@Body() dto: ModifyRoleDto) {
    return this.adminService.modifyUserRole(dto);
  }

  @Get('users')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @ApiOperation({ summary: 'List users with roles (paginated)' })
  getUsers(@Query() query: PaginationDto) {
    return this.adminService.getUsersWithRoles(query);
  }
}
