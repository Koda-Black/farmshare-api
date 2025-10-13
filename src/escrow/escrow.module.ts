import { Module } from '@nestjs/common';
import { EscrowController } from './escrow.controller';
import { EscrowService } from './escrow.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailChannelService } from '../notifications/channels/email.channel';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [EscrowController],
  providers: [EscrowService, EmailChannelService],
  exports: [EscrowService],
})
export class EscrowModule {}
