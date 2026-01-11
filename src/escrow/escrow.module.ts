import { Module } from '@nestjs/common';
import { EscrowController } from './escrow.controller';
import { EscrowService } from './escrow.service';
import { PaystackService } from '../services/paystack.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailChannelService } from '../notifications/channels/email.channel';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, NotificationsModule, HttpModule, ConfigModule],
  controllers: [EscrowController],
  providers: [EscrowService, PaystackService, EmailChannelService],
  exports: [EscrowService, PaystackService],
})
export class EscrowModule {}
