import { Module } from '@nestjs/common';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailChannelService } from '../notifications/channels/email.channel';
import { cloudinaryConfig } from '../config/cloudinary.config';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [VerificationController],
  providers: [VerificationService, EmailChannelService, cloudinaryConfig],
  exports: [VerificationService],
})
export class VerificationModule {}
