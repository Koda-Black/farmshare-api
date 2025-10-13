import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Req,
  Patch,
  Param,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../constant';
import { SendNotificationDto, RegisterDeviceDto } from './dto/notification.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get('me')
  async getMyNotifications(
    @Req() req,
    @Query('skip') skip: number = 0,
    @Query('take') take: number = 20,
    @Query('unreadOnly') unreadOnly: boolean = false,
  ) {
    return this.notificationsService.getUserNotifications(
      req.user.userId,
      skip,
      take,
      unreadOnly,
    );
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @Req() req) {
    return this.notificationsService.markAsRead(id, req.user.userId);
  }

  @Patch('mark-all-read')
  async markAllAsRead(@Req() req) {
    return this.notificationsService.markAllAsRead(req.user.userId);
  }

  @Post('devices/register')
  async registerDevice(@Body() dto: RegisterDeviceDto, @Req() req) {
    return this.notificationsService.registerDevice(
      req.user.userId,
      dto.fcmToken,
      dto.deviceType,
    );
  }

  @Post('devices/unregister')
  async unregisterDevice(@Body('fcmToken') fcmToken: string, @Req() req) {
    return this.notificationsService.unregisterDevice(
      req.user.userId,
      fcmToken,
    );
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  @Post('send')
  async sendNotification(@Body() dto: SendNotificationDto) {
    return this.notificationsService.sendNotification(
      dto.userId,
      dto.type,
      dto.mediums,
      dto.payload,
    );
  }
}
