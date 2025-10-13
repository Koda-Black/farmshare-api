import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaService } from '../services/prisma.service';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailChannelService } from '../notifications/channels/email.channel';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  imports: [JwtModule.register({}), NotificationsModule],
  controllers: [AdminController],
  providers: [AdminService, PrismaService, EmailChannelService, RolesGuard],
})
export class AdminModule {}
