import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeService } from '../services/stripe.service';
import { PaystackService } from '../services/paystack.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { PoolsModule } from '../pools/pools.module';
import { WhatsappService } from '../services/whatsapp.service';

@Module({
  imports: [ConfigModule, PrismaModule, EmailModule, PoolsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, StripeService, PaystackService, WhatsappService],
})
export class PaymentsModule {}
