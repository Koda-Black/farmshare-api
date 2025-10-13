import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { SmsChannelService } from './channels/sms.channel';
import { PushChannelService } from './channels/push.channel';
import { WebhookChannelService } from './channels/webhook.channel';
import { EmailChannelService } from './channels/email.channel';

@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    SmsChannelService,
    PushChannelService,
    WebhookChannelService,
    EmailChannelService,
  ],
  exports: [
    NotificationsService,
    SmsChannelService,
    PushChannelService,
    WebhookChannelService,
    EmailChannelService,
  ],
})
export class NotificationsModule {}
