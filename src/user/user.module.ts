import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { cloudinaryConfig } from '../config/cloudinary.config';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailChannelService } from '../notifications/channels/email.channel';
import { PrismaModule } from '../../prisma/prisma.module'; // if using PrismaService

@Module({
  imports: [PrismaModule, NotificationsModule], // Import necessary modules
  controllers: [UserController],
  providers: [UserService, EmailChannelService, cloudinaryConfig],
})
export class UserModule {}
