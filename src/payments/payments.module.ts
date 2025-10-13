import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeService } from '../services/stripe.service';
import { PaystackService } from '../services/paystack.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { EscrowModule } from '../escrow/escrow.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailChannelService } from '../notifications/channels/email.channel';
import { PoolsModule } from '../pools/pools.module';
import { CurrencyService } from '../services/currency.service';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    PrismaModule,
    PoolsModule,
    EscrowModule,
    NotificationsModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    StripeService,
    PaystackService,
    EmailChannelService,
    CurrencyService,
  ],
})
export class PaymentsModule {}
