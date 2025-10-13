import { Module } from '@nestjs/common';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailChannelService } from '../notifications/channels/email.channel';
import { EscrowModule } from '../escrow/escrow.module';
import { cloudinaryConfig } from '../config/cloudinary.config';

@Module({
  imports: [PrismaModule, NotificationsModule, EscrowModule],
  controllers: [DisputesController],
  providers: [DisputesService, EmailChannelService, cloudinaryConfig],
  exports: [DisputesService],
})
export class DisputesModule {}
